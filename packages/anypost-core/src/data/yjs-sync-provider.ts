import * as Y from "yjs";
import {
  writeSyncStep1,
  readSyncMessage,
  writeUpdate,
} from "y-protocols/sync.js";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { lpStream } from "it-length-prefixed-stream";
import type { Libp2p, PubSub, PeerId, Stream } from "@libp2p/interface";
import type { GroupId } from "../shared/schemas.js";

const SYNC_PROTOCOL = "/anypost/yjs-sync/1.0.0";

const syncTopic = (groupId: GroupId): string =>
  `anypost/yjs-sync/${groupId}`;

export type YjsSyncProviderOptions = {
  readonly node: Libp2p;
  readonly doc: Y.Doc;
  readonly groupId: GroupId;
};

export type YjsSyncProvider = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly syncWithPeer: (peerId: PeerId) => Promise<void>;
};

export const createYjsSyncProvider = (
  options: YjsSyncProviderOptions,
): YjsSyncProvider => {
  const { node, doc, groupId } = options;
  const topic = syncTopic(groupId);
  let started = false;

  const pubsub = (): PubSub => node.services.pubsub as PubSub;

  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === "remote") return;
    const encoder = encoding.createEncoder();
    writeUpdate(encoder, update);
    const encoded = encoding.toUint8Array(encoder);
    pubsub().publish(topic, encoded).catch(() => {});
  };

  const onGossipMessage = (event: CustomEvent): void => {
    const detail = event.detail as { topic: string; data: Uint8Array };
    if (detail.topic !== topic) return;
    const decoder = decoding.createDecoder(detail.data);
    const encoder = encoding.createEncoder();
    readSyncMessage(decoder, encoder, doc, "remote");
  };

  const handleSyncStream = async ({ stream }: { stream: Stream }): Promise<void> => {
    const lp = lpStream(stream);
    try {
      while (true) {
        const msg = await lp.read();
        if (!msg) break;
        const decoder = decoding.createDecoder(msg.subarray());
        const encoder = encoding.createEncoder();
        readSyncMessage(decoder, encoder, doc, "remote");
        const reply = encoding.toUint8Array(encoder);
        if (reply.byteLength > 0) {
          await lp.write(reply);
        }
      }
    } catch {
      // Stream closed or reset — expected during disconnect
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;
    doc.on("update", onDocUpdate);
    pubsub().subscribe(topic);
    pubsub().addEventListener("message", onGossipMessage);
    node.handle(SYNC_PROTOCOL, handleSyncStream, { runOnLimitedConnection: true });
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    doc.off("update", onDocUpdate);
    pubsub().unsubscribe(topic);
    pubsub().removeEventListener("message", onGossipMessage);
    node.unhandle(SYNC_PROTOCOL);
  };

  const syncWithPeer = async (peerId: PeerId): Promise<void> => {
    const connections = node.getConnections(peerId);
    if (connections.length === 0) return;

    const stream = await connections[0].newStream(SYNC_PROTOCOL, {
      runOnLimitedConnection: true,
      signal: AbortSignal.timeout(10_000),
    });

    const lp = lpStream(stream);
    try {
      const encoder = encoding.createEncoder();
      writeSyncStep1(encoder, doc);
      await lp.write(encoding.toUint8Array(encoder));

      const response = await lp.read();
      if (response && response.byteLength > 0) {
        const decoder = decoding.createDecoder(response.subarray());
        readSyncMessage(decoder, encoding.createEncoder(), doc, "remote");
      }
    } finally {
      await stream.close();
    }
  };

  return { start, stop, syncWithPeer };
};

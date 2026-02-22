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

const syncProtocol = (groupId: GroupId): string =>
  `/anypost/yjs-sync/1.0.0/${groupId}`;

const syncTopic = (groupId: GroupId): string =>
  `anypost/yjs-sync/${groupId}`;

const MAX_SYNC_DATA_LENGTH = 1024 * 1024;

const isStreamClosedError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("stream reset") ||
    error.message.includes("stream closed") ||
    error.message.includes("aborted") ||
    error.message.includes("CLOSED"));

const isGossipMessage = (
  detail: unknown,
): detail is { topic: string; data: Uint8Array } =>
  typeof detail === "object" &&
  detail !== null &&
  "topic" in detail &&
  "data" in detail;

const getPubSub = (node: Libp2p): PubSub => {
  const ps = node.services.pubsub;
  if (!ps) {
    throw new Error("Libp2p node must be configured with a PubSub service");
  }
  return ps as PubSub;
};

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
  const protocol = syncProtocol(groupId);
  const topic = syncTopic(groupId);
  let started = false;

  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === "remote") return;
    const encoder = encoding.createEncoder();
    writeUpdate(encoder, update);
    const encoded = encoding.toUint8Array(encoder);
    getPubSub(node).publish(topic, encoded).catch(() => {});
  };

  const onGossipMessage = (event: CustomEvent): void => {
    if (!isGossipMessage(event.detail)) return;
    if (event.detail.topic !== topic) return;
    try {
      const decoder = decoding.createDecoder(event.detail.data);
      const encoder = encoding.createEncoder();
      readSyncMessage(decoder, encoder, doc, "remote");
    } catch {
      // Malformed message from peer
    }
  };

  const handleSyncStream = async ({ stream }: { stream: Stream }): Promise<void> => {
    const lp = lpStream(stream, { maxDataLength: MAX_SYNC_DATA_LENGTH });
    try {
      const msg = await lp.read();
      if (!msg) return;

      const decoder = decoding.createDecoder(msg.subarray());
      const encoder = encoding.createEncoder();
      readSyncMessage(decoder, encoder, doc, "remote");
      const reply = encoding.toUint8Array(encoder);
      if (reply.byteLength > 0) {
        await lp.write(reply);
      }

      const svEncoder = encoding.createEncoder();
      writeSyncStep1(svEncoder, doc);
      await lp.write(encoding.toUint8Array(svEncoder));

      const clientReply = await lp.read();
      if (clientReply && clientReply.byteLength > 0) {
        const replyDecoder = decoding.createDecoder(clientReply.subarray());
        readSyncMessage(replyDecoder, encoding.createEncoder(), doc, "remote");
      }
    } catch (error: unknown) {
      if (!isStreamClosedError(error)) {
        throw error;
      }
    } finally {
      await stream.close().catch(() => {});
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;
    doc.on("update", onDocUpdate);
    getPubSub(node).subscribe(topic);
    getPubSub(node).addEventListener("message", onGossipMessage);
    node.handle(protocol, handleSyncStream, { runOnLimitedConnection: true });
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    doc.off("update", onDocUpdate);
    getPubSub(node).unsubscribe(topic);
    getPubSub(node).removeEventListener("message", onGossipMessage);
    node.unhandle(protocol);
  };

  const syncWithPeer = async (peerId: PeerId): Promise<void> => {
    const connections = node.getConnections(peerId);
    if (connections.length === 0) return;

    const stream = await connections[0].newStream(protocol, {
      runOnLimitedConnection: true,
      signal: AbortSignal.timeout(10_000),
    });

    const lp = lpStream(stream, { maxDataLength: MAX_SYNC_DATA_LENGTH });
    try {
      const encoder = encoding.createEncoder();
      writeSyncStep1(encoder, doc);
      await lp.write(encoding.toUint8Array(encoder));

      const response = await lp.read();
      if (response && response.byteLength > 0) {
        const decoder = decoding.createDecoder(response.subarray());
        const replyEncoder = encoding.createEncoder();
        readSyncMessage(decoder, replyEncoder, doc, "remote");
      }

      const serverSv = await lp.read();
      if (serverSv && serverSv.byteLength > 0) {
        const svDecoder = decoding.createDecoder(serverSv.subarray());
        const svEncoder = encoding.createEncoder();
        readSyncMessage(svDecoder, svEncoder, doc, "remote");
        const svReply = encoding.toUint8Array(svEncoder);
        if (svReply.byteLength > 0) {
          await lp.write(svReply);
        }
      }
    } finally {
      await stream.close();
    }
  };

  return { start, stop, syncWithPeer };
};

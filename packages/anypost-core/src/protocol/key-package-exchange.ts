import { encode, decode } from "cbor-x";
import { lpStream } from "it-length-prefixed-stream";
import type { Libp2p, Stream } from "@libp2p/interface";
import type { PeerId } from "@libp2p/interface";
import type { GroupId } from "../shared/schemas.js";

const PROTOCOL = "/anypost/key-package/1.0.0";
const MAX_DATA_LENGTH = 512 * 1024;

export type KeyPackageOffer = {
  readonly groupId: GroupId;
  readonly keyPackage: unknown;
  readonly identity: Uint8Array;
  readonly accountPublicKey: string;
};

export type KeyPackageResponse =
  | { readonly type: "welcome"; readonly welcome: unknown; readonly commit: unknown }
  | { readonly type: "error"; readonly message: string };

type OnKeyPackageOffer = (offer: KeyPackageOffer) => Promise<KeyPackageResponse>;

export type KeyPackageExchangeHandlerOptions = {
  readonly node: Libp2p;
  readonly onOffer: OnKeyPackageOffer;
};

export type KeyPackageExchangeHandler = {
  readonly start: () => void;
  readonly stop: () => void;
};

export const createKeyPackageExchangeHandler = (
  options: KeyPackageExchangeHandlerOptions,
): KeyPackageExchangeHandler => {
  const { node, onOffer } = options;
  let started = false;

  const handleStream = async ({ stream }: { stream: Stream }): Promise<void> => {
    const lp = lpStream(stream, { maxDataLength: MAX_DATA_LENGTH });
    try {
      const raw = await lp.read();
      if (!raw) return;

      const decoded = decode(raw.subarray()) as KeyPackageOffer;
      const response = await onOffer(decoded);
      await lp.write(new Uint8Array(encode(response)));
    } catch (error: unknown) {
      try {
        const errorResponse: KeyPackageResponse = {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        };
        await lp.write(new Uint8Array(encode(errorResponse)));
      } catch {
        // Stream may be closed, can't send error
      }
    } finally {
      await stream.close().catch(() => {});
    }
  };

  return {
    start: () => {
      if (started) return;
      started = true;
      node.handle(PROTOCOL, handleStream, { runOnLimitedConnection: true });
    },
    stop: () => {
      if (!started) return;
      started = false;
      node.unhandle(PROTOCOL);
    },
  };
};

type SendKeyPackageOptions = {
  readonly node: Libp2p;
  readonly peerId: PeerId;
  readonly groupId: GroupId;
  readonly keyPackage: unknown;
  readonly identity: Uint8Array;
  readonly accountPublicKey: string;
};

export const sendKeyPackage = async (
  options: SendKeyPackageOptions,
): Promise<KeyPackageResponse> => {
  const connections = options.node.getConnections(options.peerId);
  if (connections.length === 0) {
    throw new Error("Not connected to peer");
  }

  const stream = await connections[0].newStream(PROTOCOL, {
    runOnLimitedConnection: true,
    signal: AbortSignal.timeout(30_000),
  });

  const lp = lpStream(stream, { maxDataLength: MAX_DATA_LENGTH });
  try {
    const offer: KeyPackageOffer = {
      groupId: options.groupId,
      keyPackage: options.keyPackage,
      identity: options.identity,
      accountPublicKey: options.accountPublicKey,
    };
    await lp.write(new Uint8Array(encode(offer)));

    const raw = await lp.read();
    if (!raw) throw new Error("No response from peer");

    return decode(raw.subarray()) as KeyPackageResponse;
  } finally {
    await stream.close().catch(() => {});
  }
};

import { z } from "zod";
import { encode, decode } from "cbor-x";
import { lpStream } from "it-length-prefixed-stream";
import type { Libp2p, Stream } from "@libp2p/interface";
import type { PeerId } from "@libp2p/interface";
import { GroupIdSchema } from "../shared/schemas.js";
import type { GroupId } from "../shared/schemas.js";

const PROTOCOL = "/anypost/key-package/1.0.0";
const MAX_DATA_LENGTH = 512 * 1024;

const KeyPackageOfferSchema = z.object({
  groupId: GroupIdSchema,
  keyPackage: z.unknown(),
  identity: z.instanceof(Uint8Array),
  accountPublicKey: z.string().min(1),
});

const KeyPackageResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    welcome: z.unknown(),
    commit: z.unknown(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export type KeyPackageOffer = z.infer<typeof KeyPackageOfferSchema>;

export type KeyPackageResponse = z.infer<typeof KeyPackageResponseSchema>;

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

      const decoded = KeyPackageOfferSchema.parse(decode(raw.subarray()));
      const response = await onOffer(decoded);
      await lp.write(new Uint8Array(encode(response)));
    } catch (error: unknown) {
      try {
        const errorResponse: KeyPackageResponse = {
          type: "error",
          message: "Key package processing failed",
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
    const offer = {
      groupId: options.groupId,
      keyPackage: options.keyPackage,
      identity: new Uint8Array(options.identity),
      accountPublicKey: options.accountPublicKey,
    };
    await lp.write(new Uint8Array(encode(offer)));

    const raw = await lp.read();
    if (!raw) throw new Error("No response from peer");

    return KeyPackageResponseSchema.parse(decode(raw.subarray()));
  } finally {
    await stream.close().catch(() => {});
  }
};

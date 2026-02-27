import { z } from "zod";
import { ed25519 } from "@noble/curves/ed25519.js";
import { encode, decode } from "cbor-x";
import { lpStream } from "it-length-prefixed-stream";
import type { Libp2p, Stream, PeerId } from "@libp2p/interface";
import { GroupIdSchema } from "../shared/schemas.js";
import { Result } from "../shared/result.js";
import { SignedActionEnvelopeSchema, toHex } from "./action-chain.js";
import type {
  SignedActionEnvelope,
  ActionChainGroupState,
} from "./action-chain.js";
import type { AccountKey } from "../crypto/identity.js";

export const BLOCK_FETCH_PROTOCOL = "/anypost/blocks/1.0.0/get";

const MAX_HASHES_PER_REQUEST = 256;
const MAX_ENVELOPES_PER_RESPONSE = 256;
const MAX_RESPONSE_SIZE_BYTES = 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_DATA_LENGTH = 2 * 1024 * 1024;

const Uint8ArraySchema = z.instanceof(Uint8Array);
const HashSchema = z.instanceof(Uint8Array).refine(
  (v) => v.length === 32,
  { message: "Hash must be 32 bytes" },
);
const Ed25519PublicKeySchema = z.instanceof(Uint8Array).refine(
  (v) => v.length === 32,
  { message: "Public key must be 32 bytes" },
);
const Ed25519SignatureSchema = z.instanceof(Uint8Array).refine(
  (v) => v.length === 64,
  { message: "Signature must be 64 bytes" },
);

export const BlockFetchRequestSchema = z.object({
  protocolVersion: z.literal(2),
  type: z.literal("getBlocks"),
  groupId: GroupIdSchema,
  hashes: z.array(HashSchema).max(MAX_HASHES_PER_REQUEST),
  senderPublicKey: Ed25519PublicKeySchema,
  signature: Ed25519SignatureSchema,
  sentAt: z.number(),
});

export type BlockFetchRequest = z.infer<typeof BlockFetchRequestSchema>;

export const BlockFetchResponseSchema = z.object({
  envelopes: z.array(SignedActionEnvelopeSchema).max(MAX_ENVELOPES_PER_RESPONSE),
  missing: z.array(Uint8ArraySchema).max(MAX_HASHES_PER_REQUEST),
});

export type BlockFetchResponse = z.infer<typeof BlockFetchResponseSchema>;

type BlockFetchSigningFields = {
  readonly groupId: string;
  readonly hashes: readonly Uint8Array[];
  readonly sentAt: number;
};

export const encodeBlockFetchSigningPayload = (
  fields: BlockFetchSigningFields,
): Uint8Array =>
  new Uint8Array(
    encode({
      protocolVersion: 2,
      type: "getBlocks",
      groupId: fields.groupId,
      hashes: fields.hashes,
      sentAt: fields.sentAt,
    }),
  );

export const signBlockFetchRequest = (
  fields: BlockFetchSigningFields,
  privateKey: Uint8Array,
): Uint8Array =>
  new Uint8Array(
    ed25519.sign(encodeBlockFetchSigningPayload(fields), privateKey),
  );

export const verifyBlockFetchRequest = (
  request: BlockFetchRequest,
): boolean => {
  try {
    const signingPayload = encodeBlockFetchSigningPayload({
      groupId: request.groupId,
      hashes: request.hashes,
      sentAt: request.sentAt,
    });
    return ed25519.verify(
      request.signature,
      signingPayload,
      request.senderPublicKey,
    );
  } catch {
    return false;
  }
};

export const collectRequestedEnvelopes = (
  requestedHashes: readonly Uint8Array[],
  getEnvelope: (hashHex: string) => SignedActionEnvelope | undefined,
): {
  readonly envelopes: readonly SignedActionEnvelope[];
  readonly missing: readonly Uint8Array[];
} => {
  const envelopes: SignedActionEnvelope[] = [];
  const missing: Uint8Array[] = [];
  let totalSize = 0;

  for (const hash of requestedHashes) {
    const hashHex = toHex(hash);
    const envelope = getEnvelope(hashHex);

    if (!envelope) {
      missing.push(new Uint8Array(hash));
      continue;
    }

    if (envelopes.length >= MAX_ENVELOPES_PER_RESPONSE) {
      missing.push(new Uint8Array(hash));
      continue;
    }

    const envelopeSize =
      envelope.signedBytes.length +
      envelope.signature.length +
      envelope.hash.length;

    if (totalSize + envelopeSize > MAX_RESPONSE_SIZE_BYTES) {
      missing.push(new Uint8Array(hash));
      continue;
    }

    totalSize += envelopeSize;
    envelopes.push(envelope);
  }

  return { envelopes, missing };
};

export const validateBlockFetchRequest = (
  request: BlockFetchRequest,
  groupState: ActionChainGroupState,
  now?: number,
): Result<void, Error> => {
  const currentTime = now ?? Date.now();

  if (request.sentAt > currentTime + MAX_CLOCK_SKEW_MS) {
    return Result.failure(new Error("Request clock skew too large"));
  }

  if (request.sentAt < currentTime - MAX_CLOCK_SKEW_MS) {
    return Result.failure(new Error("Request too old"));
  }

  const senderHex = toHex(request.senderPublicKey);
  if (!groupState.members.has(senderHex)) {
    return Result.failure(new Error("Sender is not a group member"));
  }

  if (!verifyBlockFetchRequest(request)) {
    return Result.failure(new Error("Invalid request signature"));
  }

  return Result.success(undefined);
};

type BlockFetchHandlerDeps = {
  readonly getGroupState: (
    groupId: string,
  ) => ActionChainGroupState | undefined;
  readonly getEnvelope: (
    groupId: string,
    hashHex: string,
  ) => SignedActionEnvelope | undefined;
};

export type BlockFetchHandlerOptions = {
  readonly node: Libp2p;
  readonly deps: BlockFetchHandlerDeps;
};

export type BlockFetchHandler = {
  readonly start: () => void;
  readonly stop: () => void;
};

export const createBlockFetchHandler = (
  options: BlockFetchHandlerOptions,
): BlockFetchHandler => {
  const { node, deps } = options;
  let started = false;

  const handleStream = async ({
    stream,
  }: {
    stream: Stream;
  }): Promise<void> => {
    const lp = lpStream(stream, { maxDataLength: MAX_DATA_LENGTH });
    try {
      const raw = await lp.read();
      if (!raw) return;

      let decoded: unknown;
      try {
        decoded = decode(raw.subarray());
      } catch {
        return;
      }

      const parsed = BlockFetchRequestSchema.safeParse(decoded);
      if (!parsed.success) return;

      const request = parsed.data;

      const groupState = deps.getGroupState(request.groupId);
      if (!groupState) return;

      const validation = validateBlockFetchRequest(request, groupState);
      if (!validation.success) return;

      const response = collectRequestedEnvelopes(
        request.hashes,
        (hashHex) => deps.getEnvelope(request.groupId, hashHex),
      );

      await lp.write(new Uint8Array(encode(response)));
    } finally {
      await stream.close().catch(() => {});
    }
  };

  return {
    start: () => {
      if (started) return;
      started = true;
      node.handle(BLOCK_FETCH_PROTOCOL, handleStream, {
        runOnLimitedConnection: true,
      });
    },
    stop: () => {
      if (!started) return;
      started = false;
      node.unhandle(BLOCK_FETCH_PROTOCOL);
    },
  };
};

export type FetchBlocksOptions = {
  readonly node: Libp2p;
  readonly peerId: PeerId;
  readonly accountKey: AccountKey;
  readonly groupId: string;
  readonly hashes: readonly Uint8Array[];
};

export const fetchBlocks = async (
  options: FetchBlocksOptions,
): Promise<BlockFetchResponse> => {
  const connections = options.node.getConnections(options.peerId);
  if (connections.length === 0) {
    throw new Error("Not connected to peer");
  }

  const stream = await connections[0].newStream(BLOCK_FETCH_PROTOCOL, {
    runOnLimitedConnection: true,
    signal: AbortSignal.timeout(30_000),
  });

  const lp = lpStream(stream, { maxDataLength: MAX_DATA_LENGTH });
  try {
    const sentAt = Date.now();
    const signature = signBlockFetchRequest(
      { groupId: options.groupId, hashes: options.hashes, sentAt },
      options.accountKey.privateKey,
    );

    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: options.groupId,
      hashes: options.hashes.map((h) => new Uint8Array(h)),
      senderPublicKey: new Uint8Array(options.accountKey.publicKey),
      signature,
      sentAt,
    };

    await lp.write(new Uint8Array(encode(request)));

    const raw = await lp.read();
    if (!raw) throw new Error("No response from peer");

    return BlockFetchResponseSchema.parse(decode(raw.subarray()));
  } finally {
    await stream.close().catch(() => {});
  }
};

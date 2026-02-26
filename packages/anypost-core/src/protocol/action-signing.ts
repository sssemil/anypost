import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { encode, decode } from "cbor-x";
import type { AccountKey } from "../crypto/identity.js";
import { Result } from "../shared/result.js";
import { SignableActionSchema } from "./action-chain.js";
import type {
  ActionPayload,
  SignableAction,
  SignedAction,
  SignedActionEnvelope,
} from "./action-chain.js";

type CreateSignedActionEnvelopeOptions = {
  readonly accountKey: AccountKey;
  readonly groupId: string;
  readonly parentHashes: readonly Uint8Array[];
  readonly payload: ActionPayload;
  readonly timestamp?: number;
  readonly id?: string;
};

export const createSignedActionEnvelope = (
  options: CreateSignedActionEnvelopeOptions,
): SignedActionEnvelope => {
  const signable: SignableAction = {
    protocolVersion: 2,
    id: options.id ?? crypto.randomUUID(),
    groupId: options.groupId,
    authorPublicKey: new Uint8Array(options.accountKey.publicKey),
    timestamp: options.timestamp ?? Date.now(),
    parentHashes: options.parentHashes.map((h) => new Uint8Array(h)),
    payload: options.payload,
  };

  const signedBytes = new Uint8Array(encode(signable));
  const signature = new Uint8Array(
    ed25519.sign(signedBytes, options.accountKey.privateKey),
  );
  const hash = new Uint8Array(sha256(signedBytes));

  return { signedBytes, signature, hash };
};

export const verifyAndDecodeAction = (
  envelope: SignedActionEnvelope,
): Result<SignedAction, Error> => {
  try {
    const computedHash = sha256(envelope.signedBytes);
    if (!uint8ArrayEquals(computedHash, envelope.hash)) {
      return Result.failure(new Error("Hash mismatch"));
    }

    const raw: unknown = decode(envelope.signedBytes);
    const signable = SignableActionSchema.parse(raw);

    const valid = ed25519.verify(
      envelope.signature,
      envelope.signedBytes,
      signable.authorPublicKey,
    );
    if (!valid) {
      return Result.failure(new Error("Invalid signature"));
    }

    return Result.success({
      ...signable,
      signature: envelope.signature,
      hash: envelope.hash,
    });
  } catch (error) {
    return Result.failure(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};

const uint8ArrayEquals = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
};

import { ed25519 } from "@noble/curves/ed25519.js";
import { encode } from "cbor-x";
import { toHex } from "./action-chain.js";
import type { SignedActionEnvelope } from "./action-chain.js";

export const INCOMING_SYNC_REQUEST_MAX = 40;
export const OUTGOING_SYNC_REQUEST_MAX = 60;
export const FULL_SYNC_FALLBACK_COOLDOWN_MS = 30_000;

export type SyncRequestPayload = {
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
  readonly requestId?: string;
  readonly targetPeerId?: string;
  readonly knownHash?: Uint8Array;
};

export type SyncResponsePayload = {
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
  readonly requestId?: string;
  readonly targetPeerId: string;
  readonly requestKnownHash?: Uint8Array;
  readonly headHash?: Uint8Array;
  readonly nextCursorHash?: Uint8Array;
  readonly envelopes: ReadonlyArray<{
    readonly signedBytes: Uint8Array;
    readonly signature: Uint8Array;
    readonly hash: Uint8Array;
  }>;
};

export const encodeSyncRequestSigningPayload = (
  payload: SyncRequestPayload,
): Uint8Array =>
  new Uint8Array(
    encode({
      type: "sync_request",
      groupId: payload.groupId,
      senderPeerId: payload.senderPeerId,
      senderPublicKey: payload.senderPublicKey,
      requestId: payload.requestId,
      targetPeerId: payload.targetPeerId,
      knownHash: payload.knownHash,
    }),
  );

export const encodeSyncResponseSigningPayload = (
  payload: SyncResponsePayload,
): Uint8Array =>
  new Uint8Array(
    encode({
      type: "sync_response",
      groupId: payload.groupId,
      senderPeerId: payload.senderPeerId,
      senderPublicKey: payload.senderPublicKey,
      requestId: payload.requestId,
      targetPeerId: payload.targetPeerId,
      requestKnownHash: payload.requestKnownHash,
      headHash: payload.headHash,
      nextCursorHash: payload.nextCursorHash,
      envelopes: payload.envelopes,
    }),
  );

export const signSyncRequest = (
  payload: SyncRequestPayload,
  privateKey: Uint8Array,
): Uint8Array =>
  new Uint8Array(ed25519.sign(
    encodeSyncRequestSigningPayload(payload),
    privateKey,
  ));

export const verifySyncRequest = (
  payload: SyncRequestPayload & { readonly signature: Uint8Array },
): boolean => {
  try {
    return ed25519.verify(
      payload.signature,
      encodeSyncRequestSigningPayload(payload),
      payload.senderPublicKey,
    );
  } catch {
    return false;
  }
};

export const signSyncResponse = (
  payload: SyncResponsePayload,
  privateKey: Uint8Array,
): Uint8Array =>
  new Uint8Array(ed25519.sign(
    encodeSyncResponseSigningPayload(payload),
    privateKey,
  ));

export const verifySyncResponse = (
  payload: SyncResponsePayload & { readonly signature: Uint8Array },
): boolean => {
  try {
    return ed25519.verify(
      payload.signature,
      encodeSyncResponseSigningPayload(payload),
      payload.senderPublicKey,
    );
  } catch {
    return false;
  }
};

export const getMissingEnvelopesForKnownHash = (
  orderedEnvelopes: readonly SignedActionEnvelope[],
  knownHash?: Uint8Array,
): readonly SignedActionEnvelope[] => {
  if (orderedEnvelopes.length === 0) return [];
  if (!knownHash || knownHash.length === 0) return orderedEnvelopes;

  const knownHashHex = toHex(knownHash);
  const idx = orderedEnvelopes.findIndex(
    (envelope) => toHex(envelope.hash) === knownHashHex,
  );
  if (idx === -1) return orderedEnvelopes;
  return orderedEnvelopes.slice(idx + 1);
};

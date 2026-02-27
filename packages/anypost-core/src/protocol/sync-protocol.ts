import { ed25519 } from "@noble/curves/ed25519.js";
import { encode } from "cbor-x";
import { toHex } from "./action-chain.js";
import type { SignedActionEnvelope } from "./action-chain.js";

export const INCOMING_SYNC_REQUEST_MAX = 40;
export const OUTGOING_SYNC_REQUEST_MAX = 60;
export const FULL_SYNC_FALLBACK_COOLDOWN_MS = 30_000;
export const MAX_INLINE_ENVELOPES = 16;
export const MAX_INLINE_BYTES = 65536;
export const MERGE_TIP_THRESHOLD = 64;
const MERGE_RATE_LIMIT_MS = 60_000;

export type SyncRequestPayload = {
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
  readonly requestId?: string;
  readonly targetPeerId?: string;
  readonly knownHeads: readonly Uint8Array[];
};

export type SyncResponsePayload = {
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
  readonly requestId?: string;
  readonly targetPeerId: string;
  readonly theirHeads: readonly Uint8Array[];
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
      knownHeads: payload.knownHeads,
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
      theirHeads: payload.theirHeads,
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

export type HeadsAnnouncePayload = {
  readonly groupId: string;
  readonly heads: readonly Uint8Array[];
  readonly sentAt: number;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
};

export const encodeHeadsAnnounceSigningPayload = (
  payload: HeadsAnnouncePayload,
): Uint8Array =>
  new Uint8Array(
    encode({
      type: "heads_announce",
      groupId: payload.groupId,
      heads: payload.heads,
      sentAt: payload.sentAt,
      senderPeerId: payload.senderPeerId,
      senderPublicKey: payload.senderPublicKey,
    }),
  );

export const signHeadsAnnounce = (
  payload: HeadsAnnouncePayload,
  privateKey: Uint8Array,
): Uint8Array =>
  new Uint8Array(ed25519.sign(
    encodeHeadsAnnounceSigningPayload(payload),
    privateKey,
  ));

export const verifyHeadsAnnounce = (
  payload: HeadsAnnouncePayload & { readonly signature: Uint8Array },
): boolean => {
  try {
    return ed25519.verify(
      payload.signature,
      encodeHeadsAnnounceSigningPayload(payload),
      payload.senderPublicKey,
    );
  } catch {
    return false;
  }
};

export const collectInlineEnvelopes = (
  orderedEnvelopes: readonly SignedActionEnvelope[],
  theirKnownHeadHexes: ReadonlySet<string>,
): readonly SignedActionEnvelope[] => {
  if (orderedEnvelopes.length === 0) return [];

  let startIndex = 0;

  if (theirKnownHeadHexes.size > 0) {
    let latestKnownIndex = -1;
    for (let i = 0; i < orderedEnvelopes.length; i++) {
      if (theirKnownHeadHexes.has(toHex(orderedEnvelopes[i].hash))) {
        latestKnownIndex = i;
      }
    }
    if (latestKnownIndex === -1) return [];
    startIndex = latestKnownIndex + 1;
  }

  const result: SignedActionEnvelope[] = [];
  let totalSize = 0;

  for (let i = startIndex; i < orderedEnvelopes.length; i++) {
    if (result.length >= MAX_INLINE_ENVELOPES) break;
    const envelope = orderedEnvelopes[i];
    const size =
      envelope.signedBytes.length +
      envelope.signature.length +
      envelope.hash.length;
    if (totalSize + size > MAX_INLINE_BYTES) break;
    totalSize += size;
    result.push(envelope);
  }

  return result;
};

export const shouldTriggerMerge = (
  tipCount: number,
  authorHex: string,
  lastMergeTimestampByAuthor: ReadonlyMap<string, number>,
  now?: number,
): boolean => {
  if (tipCount <= MERGE_TIP_THRESHOLD) return false;
  const currentTime = now ?? Date.now();
  const lastMerge = lastMergeTimestampByAuthor.get(authorHex);
  if (lastMerge !== undefined && currentTime - lastMerge < MERGE_RATE_LIMIT_MS) {
    return false;
  }
  return true;
};

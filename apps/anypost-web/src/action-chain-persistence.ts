import type { SignedActionEnvelope } from "anypost-core/protocol";
import { toHex } from "anypost-core/protocol";

type SerializedEnvelope = {
  readonly signedBytes: string;
  readonly signature: string;
  readonly hash: string;
};

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

export const serializeActionChains = (
  chains: ReadonlyMap<string, readonly SignedActionEnvelope[]>,
): string => {
  const result: Record<string, readonly SerializedEnvelope[]> = {};

  for (const [groupId, envelopes] of chains) {
    result[groupId] = envelopes.map((env) => ({
      signedBytes: toHex(env.signedBytes),
      signature: toHex(env.signature),
      hash: toHex(env.hash),
    }));
  }

  return JSON.stringify(result);
};

export const deserializeActionChains = (
  json: string,
): Map<string, SignedActionEnvelope[]> => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }

    const result = new Map<string, SignedActionEnvelope[]>();
    const record = parsed as Record<string, unknown>;

    for (const [groupId, value] of Object.entries(record)) {
      if (!Array.isArray(value)) continue;

      const envelopes: SignedActionEnvelope[] = value.map(
        (item: unknown) => {
          const envelope = item as SerializedEnvelope;
          return {
            signedBytes: hexToBytes(envelope.signedBytes),
            signature: hexToBytes(envelope.signature),
            hash: hexToBytes(envelope.hash),
          };
        },
      );

      result.set(groupId, envelopes);
    }

    return result;
  } catch {
    return new Map();
  }
};

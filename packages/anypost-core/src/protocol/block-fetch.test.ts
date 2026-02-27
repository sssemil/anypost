import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  BLOCK_FETCH_PROTOCOL,
  BlockFetchRequestSchema,
  BlockFetchResponseSchema,
  encodeBlockFetchSigningPayload,
  signBlockFetchRequest,
  verifyBlockFetchRequest,
  collectRequestedEnvelopes,
  validateBlockFetchRequest,
} from "./block-fetch.js";
import type { SignedActionEnvelope, ActionChainGroupState } from "./action-chain.js";
import { toHex } from "./action-chain.js";

const makeAccountKey = () => {
  const privateKey = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(privateKey);
  const publicKey = new Uint8Array(ed25519.getPublicKey(privateKey));
  return { publicKey, privateKey };
};

const makeEnvelope = (hashBytes?: Uint8Array): SignedActionEnvelope => ({
  signedBytes: new Uint8Array([1, 2, 3]),
  signature: new Uint8Array(64),
  hash: new Uint8Array(hashBytes ?? crypto.getRandomValues(new Uint8Array(32))),
});

const GROUP_ID = "00000000-0000-4000-8000-000000000001";

const makeGroupState = (
  memberPublicKey?: Uint8Array,
): ActionChainGroupState => ({
  groupId: GROUP_ID,
  groupName: "Test",
  isDirectMessage: false,
  directMessagePeerIds: null,
  dmGenesisContributorPublicKeys: new Set(),
  dmHandshakeComplete: false,
  joinPolicy: "manual",
  createdAt: 0,
  members: new Map(
    memberPublicKey
      ? [
          [
            toHex(memberPublicKey),
            {
              publicKeyHex: toHex(memberPublicKey),
              publicKey: memberPublicKey,
              role: "member" as const,
              joinedAt: 0,
            },
          ],
        ]
      : [],
  ),
  pendingJoins: new Map(),
  readReceipts: new Map(),
  lastMergeTimestampByAuthor: new Map(),
});

describe("BLOCK_FETCH_PROTOCOL", () => {
  it("should be the expected protocol string", () => {
    expect(BLOCK_FETCH_PROTOCOL).toBe("/anypost/blocks/1.0.0/get");
  });
});

describe("BlockFetchRequestSchema", () => {
  const key = makeAccountKey();

  it("should accept a valid request", () => {
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes: [new Uint8Array(32)],
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("should reject request with wrong protocolVersion", () => {
    const request = {
      protocolVersion: 1,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes: [],
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("should reject request with more than 256 hashes", () => {
    const hashes = Array.from({ length: 257 }, () => new Uint8Array(32));
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes,
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("should reject request with invalid groupId", () => {
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: "not-a-uuid",
      hashes: [],
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("should reject request with wrong-length hash", () => {
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes: [new Uint8Array(16)],
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("should reject request with wrong-length public key", () => {
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes: [],
      senderPublicKey: new Uint8Array(16),
      signature: new Uint8Array(64),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("should reject request with wrong-length signature", () => {
    const request = {
      protocolVersion: 2,
      type: "getBlocks",
      groupId: GROUP_ID,
      hashes: [],
      senderPublicKey: key.publicKey,
      signature: new Uint8Array(32),
      sentAt: Date.now(),
    };
    const result = BlockFetchRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

describe("BlockFetchResponseSchema", () => {
  it("should accept a valid response with envelopes and missing hashes", () => {
    const response = {
      envelopes: [makeEnvelope()],
      missing: [new Uint8Array(32)],
    };
    const result = BlockFetchResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("should accept an empty response", () => {
    const response = { envelopes: [], missing: [] };
    const result = BlockFetchResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("should reject response with more than 256 envelopes", () => {
    const envelopes = Array.from({ length: 257 }, () => makeEnvelope());
    const response = { envelopes, missing: [] };
    const result = BlockFetchResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("should reject response with more than 256 missing hashes", () => {
    const missing = Array.from({ length: 257 }, () => new Uint8Array(32));
    const response = { envelopes: [], missing };
    const result = BlockFetchResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});

describe("encodeBlockFetchSigningPayload", () => {
  it("should produce a Uint8Array", () => {
    const payload = encodeBlockFetchSigningPayload({
      groupId: GROUP_ID,
      hashes: [new Uint8Array([1, 2, 3])],
      sentAt: 1000,
    });
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(payload.length).toBeGreaterThan(0);
  });

  it("should produce different output for different inputs", () => {
    const a = encodeBlockFetchSigningPayload({
      groupId: GROUP_ID,
      hashes: [new Uint8Array([1])],
      sentAt: 1000,
    });
    const b = encodeBlockFetchSigningPayload({
      groupId: GROUP_ID,
      hashes: [new Uint8Array([2])],
      sentAt: 1000,
    });
    expect(toHex(a)).not.toBe(toHex(b));
  });
});

describe("signBlockFetchRequest / verifyBlockFetchRequest", () => {
  const key = makeAccountKey();

  it("should produce a valid signature that verifies", () => {
    const fields = {
      groupId: GROUP_ID,
      hashes: [new Uint8Array(32)],
      sentAt: Date.now(),
    };
    const signature = new Uint8Array(
      signBlockFetchRequest(fields, key.privateKey),
    );

    const request = {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes: fields.hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt: fields.sentAt,
    };

    expect(verifyBlockFetchRequest(request)).toBe(true);
  });

  it("should reject signature from different key", () => {
    const otherKey = makeAccountKey();
    const fields = {
      groupId: GROUP_ID,
      hashes: [new Uint8Array(32)],
      sentAt: Date.now(),
    };
    const signature = new Uint8Array(
      signBlockFetchRequest(fields, otherKey.privateKey),
    );

    const request = {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes: fields.hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt: fields.sentAt,
    };

    expect(verifyBlockFetchRequest(request)).toBe(false);
  });

  it("should reject tampered sentAt", () => {
    const fields = {
      groupId: GROUP_ID,
      hashes: [new Uint8Array(32)],
      sentAt: Date.now(),
    };
    const signature = new Uint8Array(
      signBlockFetchRequest(fields, key.privateKey),
    );

    const request = {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes: fields.hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt: fields.sentAt + 1000,
    };

    expect(verifyBlockFetchRequest(request)).toBe(false);
  });
});

describe("collectRequestedEnvelopes", () => {
  it("should return matching envelopes for requested hashes", () => {
    const hash1 = new Uint8Array(32);
    hash1[0] = 1;
    const hash2 = new Uint8Array(32);
    hash2[0] = 2;

    const envelope1 = makeEnvelope(hash1);
    const envelope2 = makeEnvelope(hash2);

    const lookup = new Map<string, SignedActionEnvelope>();
    lookup.set(toHex(hash1), envelope1);
    lookup.set(toHex(hash2), envelope2);

    const result = collectRequestedEnvelopes(
      [hash1, hash2],
      (hashHex) => lookup.get(hashHex),
    );

    expect(result.envelopes).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });

  it("should report missing hashes for unknown items", () => {
    const hash1 = new Uint8Array(32);
    hash1[0] = 1;
    const hash2 = new Uint8Array(32);
    hash2[0] = 2;

    const lookup = new Map<string, SignedActionEnvelope>();
    lookup.set(toHex(hash1), makeEnvelope(hash1));

    const result = collectRequestedEnvelopes(
      [hash1, hash2],
      (hashHex) => lookup.get(hashHex),
    );

    expect(result.envelopes).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(toHex(result.missing[0])).toBe(toHex(hash2));
  });

  it("should cap at 256 envelopes", () => {
    const lookup = new Map<string, SignedActionEnvelope>();
    const hashes: Uint8Array[] = [];

    for (let i = 0; i < 300; i++) {
      const hash = new Uint8Array(32);
      hash[0] = i & 0xff;
      hash[1] = (i >> 8) & 0xff;
      hashes.push(hash);
      lookup.set(toHex(hash), makeEnvelope(hash));
    }

    const result = collectRequestedEnvelopes(
      hashes,
      (hashHex) => lookup.get(hashHex),
    );

    expect(result.envelopes).toHaveLength(256);
    expect(result.missing).toHaveLength(44);
  });

  it("should cap at 1 MiB total size", () => {
    const lookup = new Map<string, SignedActionEnvelope>();
    const hashes: Uint8Array[] = [];

    for (let i = 0; i < 5; i++) {
      const hash = new Uint8Array(32);
      hash[0] = i;
      hashes.push(hash);
      lookup.set(toHex(hash), {
        signedBytes: new Uint8Array(500 * 1024),
        signature: new Uint8Array(64),
        hash,
      });
    }

    const result = collectRequestedEnvelopes(
      hashes,
      (hashHex) => lookup.get(hashHex),
    );

    expect(result.envelopes.length).toBeLessThanOrEqual(2);
    expect(result.missing.length).toBeGreaterThanOrEqual(3);
  });

  it("should handle empty request", () => {
    const result = collectRequestedEnvelopes([], () => undefined);

    expect(result.envelopes).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
});

describe("validateBlockFetchRequest", () => {
  const key = makeAccountKey();

  const makeValidRequest = () => {
    const sentAt = Date.now();
    const hashes = [new Uint8Array(32)];
    const signature = new Uint8Array(
      signBlockFetchRequest(
        { groupId: GROUP_ID, hashes, sentAt },
        key.privateKey,
      ),
    );
    return {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt,
    };
  };

  it("should accept valid request from member", () => {
    const request = makeValidRequest();
    const groupState = makeGroupState(key.publicKey);

    const result = validateBlockFetchRequest(request, groupState);
    expect(result.success).toBe(true);
  });

  it("should reject invalid signature", () => {
    const request = makeValidRequest();
    const tamperedRequest = { ...request, sentAt: request.sentAt + 1000 };
    const groupState = makeGroupState(key.publicKey);

    const result = validateBlockFetchRequest(tamperedRequest, groupState);
    expect(result.success).toBe(false);
  });

  it("should reject sentAt too far in the future", () => {
    const futureTime = Date.now() + 10 * 60 * 1000;
    const hashes = [new Uint8Array(32)];
    const signature = new Uint8Array(
      signBlockFetchRequest(
        { groupId: GROUP_ID, hashes, sentAt: futureTime },
        key.privateKey,
      ),
    );
    const request = {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt: futureTime,
    };
    const groupState = makeGroupState(key.publicKey);

    const result = validateBlockFetchRequest(request, groupState);
    expect(result.success).toBe(false);
  });

  it("should reject sentAt too far in the past", () => {
    const pastTime = Date.now() - 10 * 60 * 1000;
    const hashes = [new Uint8Array(32)];
    const signature = new Uint8Array(
      signBlockFetchRequest(
        { groupId: GROUP_ID, hashes, sentAt: pastTime },
        key.privateKey,
      ),
    );
    const request = {
      protocolVersion: 2 as const,
      type: "getBlocks" as const,
      groupId: GROUP_ID,
      hashes,
      senderPublicKey: new Uint8Array(key.publicKey),
      signature,
      sentAt: pastTime,
    };
    const groupState = makeGroupState(key.publicKey);

    const result = validateBlockFetchRequest(request, groupState);
    expect(result.success).toBe(false);
  });

  it("should reject non-member sender", () => {
    const request = makeValidRequest();
    const otherKey = makeAccountKey();
    const groupState = makeGroupState(otherKey.publicKey);

    const result = validateBlockFetchRequest(request, groupState);
    expect(result.success).toBe(false);
  });
});

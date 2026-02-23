import { describe, it, expect } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import { GENESIS_HASH } from "./action-chain.js";
import type { ActionPayload } from "./action-chain.js";
import {
  createSignedActionEnvelope,
  verifyAndDecodeAction,
} from "./action-signing.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const createTestPayload = (
  overrides?: Partial<ActionPayload & { type: "group-created" }>,
): ActionPayload => ({
  type: "group-created",
  groupName: "Test Group",
  ...overrides,
});

describe("Action signing", () => {
  describe("createSignedActionEnvelope", () => {
    it("should produce an envelope with signedBytes, signature, and hash", () => {
      const accountKey = generateAccountKey();

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload(),
      });

      expect(envelope.signedBytes).toBeInstanceOf(Uint8Array);
      expect(envelope.signature).toBeInstanceOf(Uint8Array);
      expect(envelope.signature.length).toBe(64);
      expect(envelope.hash).toBeInstanceOf(Uint8Array);
      expect(envelope.hash.length).toBe(32);
    });

    it("should produce different signatures for different payloads", () => {
      const accountKey = generateAccountKey();

      const envelope1 = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload({ groupName: "Group A" }),
      });

      const envelope2 = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload({ groupName: "Group B" }),
      });

      expect(envelope1.signature).not.toEqual(envelope2.signature);
      expect(envelope1.hash).not.toEqual(envelope2.hash);
    });
  });

  describe("verifyAndDecodeAction", () => {
    it("should verify and decode a valid envelope", () => {
      const accountKey = generateAccountKey();
      const payload = createTestPayload();

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload,
      });

      const result = verifyAndDecodeAction(envelope);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.groupId).toBe(DEFAULT_GROUP_ID);
      expect(result.data.authorPublicKey).toEqual(accountKey.publicKey);
      expect(result.data.payload.type).toBe("group-created");
      expect(result.data.parentHashes).toHaveLength(1);
      expect(result.data.signature).toBeInstanceOf(Uint8Array);
      expect(result.data.hash).toEqual(envelope.hash);
    });

    it("should reject an envelope with tampered signedBytes", () => {
      const accountKey = generateAccountKey();

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload(),
      });

      const tamperedBytes = new Uint8Array(envelope.signedBytes);
      tamperedBytes[0] = tamperedBytes[0] ^ 0xff;

      const result = verifyAndDecodeAction({
        ...envelope,
        signedBytes: tamperedBytes,
      });

      expect(result.success).toBe(false);
    });

    it("should reject an envelope signed by a different key", () => {
      const accountKey = generateAccountKey();
      const wrongKey = generateAccountKey();

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload(),
      });

      const wrongEnvelope = createSignedActionEnvelope({
        accountKey: wrongKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload(),
      });

      const result = verifyAndDecodeAction({
        signedBytes: envelope.signedBytes,
        signature: wrongEnvelope.signature,
        hash: envelope.hash,
      });

      expect(result.success).toBe(false);
    });

    it("should reject an envelope with mismatched hash", () => {
      const accountKey = generateAccountKey();

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: createTestPayload(),
      });

      const wrongHash = new Uint8Array(32).fill(0xff);

      const result = verifyAndDecodeAction({
        ...envelope,
        hash: wrongHash,
      });

      expect(result.success).toBe(false);
    });

    it("should round-trip a message payload", () => {
      const accountKey = generateAccountKey();
      const messagePayload: ActionPayload = {
        type: "message",
        text: "Hello world",
      };

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: messagePayload,
      });

      const result = verifyAndDecodeAction(envelope);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.payload).toEqual(messagePayload);
    });

    it("should round-trip an action with multiple parent hashes", () => {
      const accountKey = generateAccountKey();
      const parent1 = new Uint8Array(32).fill(1);
      const parent2 = new Uint8Array(32).fill(2);

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: DEFAULT_GROUP_ID,
        parentHashes: [parent1, parent2],
        payload: { type: "message", text: "Concurrent write" },
      });

      const result = verifyAndDecodeAction(envelope);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.parentHashes).toHaveLength(2);
    });

    it("should reject completely invalid bytes", () => {
      const result = verifyAndDecodeAction({
        signedBytes: new Uint8Array([0, 1, 2]),
        signature: new Uint8Array(64),
        hash: new Uint8Array(32),
      });

      expect(result.success).toBe(false);
    });
  });
});

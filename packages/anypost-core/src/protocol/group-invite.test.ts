import { describe, it, expect } from "vitest";
import { encodeGroupInvite, decodeGroupInvite } from "./group-invite.js";
import type { GroupInvite } from "./group-invite.js";
import { createSignedActionEnvelope } from "./action-signing.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import { generateAccountKey } from "../crypto/identity.js";

const TEST_RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/ws/p2p/12D3KooWTestRelay";

const createGenesisInvite = (
  overrides?: Partial<{ relayAddr: string }>,
): GroupInvite => {
  const accountKey = generateAccountKey();
  const genesisEnvelope = createSignedActionEnvelope({
    accountKey,
    groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    parentHashes: [GENESIS_HASH],
    payload: { type: "group-created", groupName: "Test Group" },
  });

  return {
    genesisEnvelope,
    relayAddr: overrides?.relayAddr ?? TEST_RELAY_ADDR,
  };
};

describe("Group invite", () => {
  describe("encodeGroupInvite", () => {
    it("should produce a non-empty base64url string", () => {
      const invite = createGenesisInvite();

      const encoded = encodeGroupInvite(invite);

      expect(encoded.length).toBeGreaterThan(0);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("decodeGroupInvite", () => {
    it("should round-trip a valid genesis invite", () => {
      const invite = createGenesisInvite();

      const encoded = encodeGroupInvite(invite);
      const result = decodeGroupInvite(encoded);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.relayAddr).toBe(TEST_RELAY_ADDR);
      expect(toHex(result.data.genesisEnvelope.signedBytes)).toBe(
        toHex(invite.genesisEnvelope.signedBytes),
      );
      expect(toHex(result.data.genesisEnvelope.signature)).toBe(
        toHex(invite.genesisEnvelope.signature),
      );
      expect(toHex(result.data.genesisEnvelope.hash)).toBe(
        toHex(invite.genesisEnvelope.hash),
      );
    });

    it("should reject invalid base64url", () => {
      const result = decodeGroupInvite("not-valid-base64!!!");

      expect(result.success).toBe(false);
    });

    it("should reject tampered signature", () => {
      const invite = createGenesisInvite();
      const encoded = encodeGroupInvite(invite);

      const decoded = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      decoded.signature = "ff".repeat(64);
      const tampered = btoa(JSON.stringify(decoded))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = decodeGroupInvite(tampered);

      expect(result.success).toBe(false);
    });

    it("should reject non-genesis action envelope", () => {
      const accountKey = generateAccountKey();
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        parentHashes: [GENESIS_HASH],
        payload: { type: "message", text: "hello" },
      });

      const invite: GroupInvite = {
        genesisEnvelope: envelope,
        relayAddr: TEST_RELAY_ADDR,
      };

      const encoded = encodeGroupInvite(invite);
      const result = decodeGroupInvite(encoded);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("group-created");
      }
    });

    it("should reject envelope with non-genesis parent hash", () => {
      const accountKey = generateAccountKey();
      const nonGenesisParent = new Uint8Array(32);
      nonGenesisParent[0] = 1;

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        parentHashes: [nonGenesisParent],
        payload: { type: "group-created", groupName: "Bad Group" },
      });

      const invite: GroupInvite = {
        genesisEnvelope: envelope,
        relayAddr: TEST_RELAY_ADDR,
      };

      const encoded = encodeGroupInvite(invite);
      const result = decodeGroupInvite(encoded);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("genesis");
      }
    });

    it("should reject malformed JSON payload", () => {
      const result = decodeGroupInvite(
        btoa("not json")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
      );

      expect(result.success).toBe(false);
    });
  });
});

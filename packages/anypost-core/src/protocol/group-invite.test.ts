import { describe, it, expect } from "vitest";
import { encodeGroupInvite, decodeGroupInvite } from "./group-invite.js";
import type { GroupInvite } from "./group-invite.js";
import { createSignedActionEnvelope } from "./action-signing.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import { generateAccountKey } from "../crypto/identity.js";
import { createInviteGrant } from "./invite-grant.js";

const TEST_RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/ws/p2p/12D3KooWTestRelay";
const TEST_ADMIN_PEER_ID = "12D3KooWTestAdminPeerId";
const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const createGenesisInvite = (
  overrides?: Partial<{
    relayAddr: string;
    adminPeerId: string;
    withInviteGrant: boolean;
  }>,
): GroupInvite => {
  const accountKey = generateAccountKey();
  const genesisEnvelope = createSignedActionEnvelope({
    accountKey,
    groupId: TEST_GROUP_ID,
    parentHashes: [GENESIS_HASH],
    payload: { type: "group-created", groupName: "Test Group" },
  });

  return {
    genesisEnvelope,
    relayAddr: overrides?.relayAddr ?? TEST_RELAY_ADDR,
    adminPeerId: overrides?.adminPeerId ?? TEST_ADMIN_PEER_ID,
    inviteGrant: overrides?.withInviteGrant
      ? createInviteGrant({
          accountKey,
          groupId: TEST_GROUP_ID,
          policy: { kind: "open", maxJoiners: 5 },
        })
      : undefined,
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
        adminPeerId: TEST_ADMIN_PEER_ID,
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
        adminPeerId: TEST_ADMIN_PEER_ID,
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

    it("should round-trip adminPeerId", () => {
      const invite = createGenesisInvite({ adminPeerId: "12D3KooWCustomPeerId" });

      const encoded = encodeGroupInvite(invite);
      const result = decodeGroupInvite(encoded);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.adminPeerId).toBe("12D3KooWCustomPeerId");
    });

    it("should reject invite missing adminPeerId", () => {
      const invite = createGenesisInvite();
      const encoded = encodeGroupInvite(invite);

      const decoded = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      delete decoded.adminPeerId;
      const tampered = btoa(JSON.stringify(decoded))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = decodeGroupInvite(tampered);

      expect(result.success).toBe(false);
    });

    it("should round-trip invite grant when present", () => {
      const invite = createGenesisInvite({ withInviteGrant: true });

      const encoded = encodeGroupInvite(invite);
      const result = decodeGroupInvite(encoded);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.inviteGrant).toBeDefined();
      expect(result.data.inviteGrant?.claims.kind).toBe("open");
    });

    it("should reject tampered invite grant signature", () => {
      const invite = createGenesisInvite({ withInviteGrant: true });
      const encoded = encodeGroupInvite(invite);
      const decoded = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      decoded.inviteGrant.signature = "ff".repeat(64);
      const tampered = btoa(JSON.stringify(decoded))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = decodeGroupInvite(tampered);
      expect(result.success).toBe(false);
    });
  });
});

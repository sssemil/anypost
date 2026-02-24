import { describe, it, expect } from "vitest";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import { encodeGroupInvite, decodeGroupInvite } from "./group-invite.js";
import type { GroupInvite } from "./group-invite.js";
import { createSignedActionEnvelope } from "./action-signing.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import { generateAccountKey } from "../crypto/identity.js";
import { createInviteGrant } from "./invite-grant.js";

const TEST_RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/ws/p2p/12D3KooWTestRelay";
const TEST_ADMIN_PEER_ID = "12D3KooWTestAdminPeerId";
const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

type SerializedInvitePayload = {
  v: number;
  sb: Uint8Array;
  sg: Uint8Array;
  a?: string;
  r?: string;
  g?: {
    c: unknown;
    p: Uint8Array;
    s: Uint8Array;
  };
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlToBytes = (code: string): Uint8Array => {
  const base64 = code.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(code.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const decodeSerializedInvite = (code: string): SerializedInvitePayload =>
  cborDecode(base64UrlToBytes(code)) as SerializedInvitePayload;

const encodeSerializedInvite = (payload: SerializedInvitePayload): string =>
  bytesToBase64Url(new Uint8Array(cborEncode(payload)));

const toHexString = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const legacyEncodeInviteLength = (invite: GroupInvite): number => {
  const legacy = {
    signedBytes: toHexString(invite.genesisEnvelope.signedBytes),
    signature: toHexString(invite.genesisEnvelope.signature),
    hash: toHexString(invite.genesisEnvelope.hash),
    relayAddr: invite.relayAddr,
    adminPeerId: invite.adminPeerId,
    inviteGrant: invite.inviteGrant
      ? {
          claims: invite.inviteGrant.claims,
          issuerPublicKey: toHexString(invite.inviteGrant.issuerPublicKey),
          signature: toHexString(invite.inviteGrant.signature),
        }
      : undefined,
  };
  return btoa(JSON.stringify(legacy))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .length;
};

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

    it("should be smaller than the legacy hex/json invite format", () => {
      const invite = createGenesisInvite({ withInviteGrant: true });
      const compact = encodeGroupInvite(invite);
      const legacyLength = legacyEncodeInviteLength(invite);
      expect(compact.length).toBeLessThan(legacyLength);
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
      const payload = decodeSerializedInvite(encoded);
      payload.sg = new Uint8Array(64).fill(0xff);
      const tampered = encodeSerializedInvite(payload);

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

    it("should reject malformed binary payload", () => {
      const result = decodeGroupInvite(bytesToBase64Url(new Uint8Array([1, 2, 3, 4])));
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

    it("should decode invites without relayAddr", () => {
      const invite = createGenesisInvite();
      const encoded = encodeGroupInvite(invite);
      const payload = decodeSerializedInvite(encoded);
      delete payload.r;
      const noRelayCode = encodeSerializedInvite(payload);

      const result = decodeGroupInvite(noRelayCode);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.relayAddr).toBeUndefined();
      expect(result.data.adminPeerId).toBe(TEST_ADMIN_PEER_ID);
    });

    it("should reject invite missing adminPeerId", () => {
      const invite = createGenesisInvite();
      const encoded = encodeGroupInvite(invite);
      const payload = decodeSerializedInvite(encoded);
      delete payload.a;
      const tampered = encodeSerializedInvite(payload);

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
      const payload = decodeSerializedInvite(encoded);
      if (!payload.g) throw new Error("Missing invite grant in fixture");
      payload.g.s = new Uint8Array(64).fill(0xff);
      const tampered = encodeSerializedInvite(payload);

      const result = decodeGroupInvite(tampered);
      expect(result.success).toBe(false);
    });
  });
});

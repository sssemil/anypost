import { describe, it, expect } from "vitest";
import {
  ActionPayloadSchema,
  SignableActionSchema,
  SignedActionEnvelopeSchema,
  ActionRoleSchema,
  GENESIS_HASH,
} from "./action-chain.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const DEFAULT_ACTION_ID = "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const DEFAULT_TIMESTAMP = 1700000000000;
const DEFAULT_PUBLIC_KEY = new Uint8Array(32).fill(1);

describe("Action chain schemas", () => {
  describe("ActionRoleSchema", () => {
    it("should accept owner, admin and member roles", () => {
      expect(ActionRoleSchema.parse("owner")).toBe("owner");
      expect(ActionRoleSchema.parse("admin")).toBe("admin");
      expect(ActionRoleSchema.parse("member")).toBe("member");
    });

    it("should reject invalid roles", () => {
      expect(() => ActionRoleSchema.parse("")).toThrow();
    });
  });

  describe("ActionPayloadSchema", () => {
    it("should accept group-created payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "group-created",
        groupName: "My Group",
      });

      expect(payload.type).toBe("group-created");
    });

    it("should accept dm-created payload with sorted peers", () => {
      const payload = ActionPayloadSchema.parse({
        type: "dm-created",
        peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
      });

      expect(payload.type).toBe("dm-created");
    });

    it("should accept join-request payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "join-request",
        requesterPublicKey: DEFAULT_PUBLIC_KEY,
      });

      expect(payload.type).toBe("join-request");
    });

    it("should accept member-approved payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "member-approved",
        memberPublicKey: DEFAULT_PUBLIC_KEY,
        role: "member",
      });

      expect(payload.type).toBe("member-approved");
    });

    it("should reject member-approved payload with owner role", () => {
      expect(() =>
        ActionPayloadSchema.parse({
          type: "member-approved",
          memberPublicKey: DEFAULT_PUBLIC_KEY,
          role: "owner",
        }),
      ).toThrow();
    });

    it("should accept member-left payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "member-left",
      });

      expect(payload.type).toBe("member-left");
    });

    it("should accept member-removed payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "member-removed",
        memberPublicKey: DEFAULT_PUBLIC_KEY,
      });

      expect(payload.type).toBe("member-removed");
    });

    it("should accept role-changed payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "role-changed",
        memberPublicKey: DEFAULT_PUBLIC_KEY,
        newRole: "admin",
      });

      expect(payload.type).toBe("role-changed");
    });

    it("should accept group-renamed payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "group-renamed",
        newName: "New Name",
      });

      expect(payload.type).toBe("group-renamed");
    });

    it("should accept join-policy-changed payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "join-policy-changed",
        joinPolicy: "auto_with_invite",
      });

      expect(payload.type).toBe("join-policy-changed");
    });

    it("should accept message payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "message",
        text: "Hello world",
      });

      expect(payload.type).toBe("message");
    });

    it("should accept read-receipt payload", () => {
      const payload = ActionPayloadSchema.parse({
        type: "read-receipt",
        upToActionId: DEFAULT_ACTION_ID,
      });

      expect(payload.type).toBe("read-receipt");
    });

    it("should reject payload with unknown type", () => {
      expect(() =>
        ActionPayloadSchema.parse({ type: "unknown-type" }),
      ).toThrow();
    });

    it("should reject group-created with empty name", () => {
      expect(() =>
        ActionPayloadSchema.parse({ type: "group-created", groupName: "" }),
      ).toThrow();
    });

    it("should reject dm-created with unsorted peers", () => {
      expect(() =>
        ActionPayloadSchema.parse({
          type: "dm-created",
          peerIds: ["12D3KooWZuluPeer", "12D3KooWAlphaPeer"],
        }),
      ).toThrow();
    });

    it("should reject message with empty text", () => {
      expect(() =>
        ActionPayloadSchema.parse({ type: "message", text: "" }),
      ).toThrow();
    });
  });

  describe("SignableActionSchema", () => {
    it("should accept a valid signable action", () => {
      const action = SignableActionSchema.parse({
        id: DEFAULT_ACTION_ID,
        groupId: DEFAULT_GROUP_ID,
        authorPublicKey: DEFAULT_PUBLIC_KEY,
        timestamp: DEFAULT_TIMESTAMP,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Test" },
      });

      expect(action.id).toBe(DEFAULT_ACTION_ID);
      expect(action.groupId).toBe(DEFAULT_GROUP_ID);
      expect(action.authorPublicKey).toEqual(DEFAULT_PUBLIC_KEY);
      expect(action.parentHashes).toHaveLength(1);
    });

    it("should reject action with non-UUID id", () => {
      expect(() =>
        SignableActionSchema.parse({
          id: "not-a-uuid",
          groupId: DEFAULT_GROUP_ID,
          authorPublicKey: DEFAULT_PUBLIC_KEY,
          timestamp: DEFAULT_TIMESTAMP,
          parentHashes: [GENESIS_HASH],
          payload: { type: "group-created", groupName: "Test" },
        }),
      ).toThrow();
    });

    it("should reject action with non-UUID groupId", () => {
      expect(() =>
        SignableActionSchema.parse({
          id: DEFAULT_ACTION_ID,
          groupId: "not-a-uuid",
          authorPublicKey: DEFAULT_PUBLIC_KEY,
          timestamp: DEFAULT_TIMESTAMP,
          parentHashes: [GENESIS_HASH],
          payload: { type: "group-created", groupName: "Test" },
        }),
      ).toThrow();
    });

    it("should accept action with multiple parent hashes", () => {
      const hash1 = new Uint8Array(32).fill(1);
      const hash2 = new Uint8Array(32).fill(2);

      const action = SignableActionSchema.parse({
        id: DEFAULT_ACTION_ID,
        groupId: DEFAULT_GROUP_ID,
        authorPublicKey: DEFAULT_PUBLIC_KEY,
        timestamp: DEFAULT_TIMESTAMP,
        parentHashes: [hash1, hash2],
        payload: { type: "message", text: "Hello" },
      });

      expect(action.parentHashes).toHaveLength(2);
    });
  });

  describe("SignedActionEnvelopeSchema", () => {
    it("should accept a valid envelope", () => {
      const envelope = SignedActionEnvelopeSchema.parse({
        signedBytes: new Uint8Array([1, 2, 3]),
        signature: new Uint8Array(64).fill(0),
        hash: new Uint8Array(32).fill(0),
      });

      expect(envelope.signedBytes).toBeInstanceOf(Uint8Array);
      expect(envelope.signature).toBeInstanceOf(Uint8Array);
      expect(envelope.hash).toBeInstanceOf(Uint8Array);
    });
  });

  describe("GENESIS_HASH", () => {
    it("should be a 32-byte all-zeros array", () => {
      expect(GENESIS_HASH).toBeInstanceOf(Uint8Array);
      expect(GENESIS_HASH.length).toBe(32);
      expect(GENESIS_HASH.every((b) => b === 0)).toBe(true);
    });
  });
});

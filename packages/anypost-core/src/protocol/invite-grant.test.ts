import { describe, it, expect } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import {
  createInviteGrant,
  verifyInviteGrant,
  validateInviteGrantForJoin,
} from "./invite-grant.js";

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("invite grant", () => {
  it("creates and verifies a targeted invite", () => {
    const accountKey = generateAccountKey();
    const grant = createInviteGrant({
      accountKey,
      groupId: TEST_GROUP_ID,
      policy: {
        kind: "targeted-peer",
        targetPeerId: "12D3KooWTargetPeer",
      },
    });

    const verified = verifyInviteGrant(grant, { groupId: TEST_GROUP_ID });
    expect(verified.success).toBe(true);
    if (!verified.success) return;
    expect(verified.data.kind).toBe("targeted-peer");
  });

  it("rejects a targeted invite for a different peer", () => {
    const accountKey = generateAccountKey();
    const grant = createInviteGrant({
      accountKey,
      groupId: TEST_GROUP_ID,
      policy: {
        kind: "targeted-peer",
        targetPeerId: "12D3KooWTargetPeer",
      },
    });

    const result = validateInviteGrantForJoin(grant, {
      groupId: TEST_GROUP_ID,
      requesterPeerId: "12D3KooWAnotherPeer",
    });

    expect(result.success).toBe(false);
  });

  it("enforces open invite expiry", () => {
    const accountKey = generateAccountKey();
    const now = Date.now();
    const grant = createInviteGrant({
      accountKey,
      groupId: TEST_GROUP_ID,
      policy: {
        kind: "open",
        expiresAt: now - 1,
      },
      issuedAt: now - 10,
    });

    const result = validateInviteGrantForJoin(grant, {
      groupId: TEST_GROUP_ID,
      requesterPeerId: "12D3KooWAnyPeer",
      now,
    });

    expect(result.success).toBe(false);
  });

  it("enforces open invite maxJoiners when approvedCount is provided", () => {
    const accountKey = generateAccountKey();
    const grant = createInviteGrant({
      accountKey,
      groupId: TEST_GROUP_ID,
      policy: {
        kind: "open",
        maxJoiners: 1,
      },
    });

    const blocked = validateInviteGrantForJoin(grant, {
      groupId: TEST_GROUP_ID,
      requesterPeerId: "12D3KooWAnyPeer",
      approvedCount: 1,
    });

    const allowed = validateInviteGrantForJoin(grant, {
      groupId: TEST_GROUP_ID,
      requesterPeerId: "12D3KooWAnyPeer",
      approvedCount: 0,
    });

    expect(blocked.success).toBe(false);
    expect(allowed.success).toBe(true);
  });
});

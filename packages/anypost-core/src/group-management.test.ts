import { describe, it, expect } from "vitest";
import {
  createGroup,
  inviteMember,
  acceptInvite,
  leaveGroup,
} from "./group-management.js";
import {
  initMlsContext,
  createMlsKeyPackage,
  getMemberCount,
} from "./crypto/mls-manager.js";
import type { MlsContext } from "./crypto/mls-manager.js";
import { deviceMlsIdentity } from "./crypto/multi-device.js";
import { getGroupMetadata, getMembers } from "./data/group-document.js";
import { getStewardMembers } from "./crypto/steward.js";

const setupContext = async (): Promise<MlsContext> => initMlsContext();

const setupIdentity = (peerId: string) => ({
  peerId,
  identity: deviceMlsIdentity(peerId),
  accountPublicKey: `ed25519:${peerId}-account`,
});

const setupKeyPackage = async (context: MlsContext, identity: Uint8Array) =>
  createMlsKeyPackage({ context, identity });

describe("Group management", () => {
  describe("createGroup", () => {
    it("should create an MLS group and a Yjs doc", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const creatorKp = await setupKeyPackage(context, creator.identity);

      const result = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      expect(getMemberCount(result.stewardState.groupState)).toBe(1);
      expect(result.groupDoc.guid).toBe(
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
    });

    it("should set the group creator as owner role", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const creatorKp = await setupKeyPackage(context, creator.identity);

      const result = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      const members = getMembers(result.groupDoc);
      expect(members).toHaveLength(1);
      expect(members[0].accountPublicKey).toBe(creator.accountPublicKey);
      expect(members[0].role).toBe("owner");
    });

    it("should set the owner as initial steward", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const creatorKp = await setupKeyPackage(context, creator.identity);

      const result = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      const metadata = getGroupMetadata(result.groupDoc);
      expect(metadata).not.toBeNull();
      expect(metadata!.stewardPeerId).toBe(creator.peerId);

      const stewardMembers = getStewardMembers(result.stewardState);
      expect(stewardMembers).toHaveLength(1);
      expect(stewardMembers[0].identity).toEqual(creator.identity);
    });
  });

  describe("inviteMember", () => {
    it("should add member to MLS group and Yjs doc", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const invitee = setupIdentity("12D3KooWInvitee1");
      const creatorKp = await setupKeyPackage(context, creator.identity);
      const inviteeKp = await setupKeyPackage(context, invitee.identity);

      const group = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      const inviteResult = await inviteMember({
        stewardState: group.stewardState,
        groupDoc: group.groupDoc,
        inviteeKeyPackage: inviteeKp.publicPackage,
        inviteeIdentity: invitee.identity,
        inviteeAccountPublicKey: invitee.accountPublicKey,
        senderIdentity: creator.identity,
      });

      expect(
        getMemberCount(inviteResult.newStewardState.groupState),
      ).toBe(2);
      expect(inviteResult.welcome).toBeDefined();
      expect(inviteResult.commit).toBeDefined();

      const yjsMembers = getMembers(group.groupDoc);
      expect(yjsMembers).toHaveLength(2);
      const inviteeEntry = yjsMembers.find(
        (m) => m.accountPublicKey === invitee.accountPublicKey,
      );
      expect(inviteeEntry).toBeDefined();
      expect(inviteeEntry!.role).toBe("member");
    });
  });

  describe("acceptInvite", () => {
    it("should join MLS group and create Yjs doc", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const invitee = setupIdentity("12D3KooWInvitee1");
      const creatorKp = await setupKeyPackage(context, creator.identity);
      const inviteeKp = await setupKeyPackage(context, invitee.identity);

      const group = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      const inviteResult = await inviteMember({
        stewardState: group.stewardState,
        groupDoc: group.groupDoc,
        inviteeKeyPackage: inviteeKp.publicPackage,
        inviteeIdentity: invitee.identity,
        inviteeAccountPublicKey: invitee.accountPublicKey,
        senderIdentity: creator.identity,
      });

      const acceptResult = await acceptInvite({
        context,
        welcome: inviteResult.welcome,
        keyPackage: inviteeKp,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      });

      expect(acceptResult.groupState).toBeDefined();
      expect(acceptResult.groupDoc.guid).toBe(
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
    });
  });

  describe("leaveGroup", () => {
    it("should remove member from MLS group and Yjs doc", async () => {
      const context = await setupContext();
      const creator = setupIdentity("12D3KooWCreator1");
      const invitee = setupIdentity("12D3KooWInvitee1");
      const creatorKp = await setupKeyPackage(context, creator.identity);
      const inviteeKp = await setupKeyPackage(context, invitee.identity);

      const group = await createGroup({
        context,
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupName: "Test Group",
        creatorKeyPackage: creatorKp,
        creatorIdentity: creator.identity,
        creatorAccountPublicKey: creator.accountPublicKey,
        creatorPeerId: creator.peerId,
      });

      const inviteResult = await inviteMember({
        stewardState: group.stewardState,
        groupDoc: group.groupDoc,
        inviteeKeyPackage: inviteeKp.publicPackage,
        inviteeIdentity: invitee.identity,
        inviteeAccountPublicKey: invitee.accountPublicKey,
        senderIdentity: creator.identity,
      });

      const leaveResult = await leaveGroup({
        stewardState: inviteResult.newStewardState,
        groupDoc: group.groupDoc,
        memberIdentity: invitee.identity,
        memberAccountPublicKey: invitee.accountPublicKey,
        senderIdentity: creator.identity,
      });

      expect(
        getMemberCount(leaveResult.newStewardState.groupState),
      ).toBe(1);
      expect(leaveResult.commit).toBeDefined();

      const yjsMembers = getMembers(group.groupDoc);
      expect(yjsMembers).toHaveLength(1);
      expect(yjsMembers[0].accountPublicKey).toBe(creator.accountPublicKey);
    });
  });
});

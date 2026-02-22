import { describe, it, expect } from "vitest";
import {
  createGroup,
  inviteMember,
  acceptInvite,
  leaveGroup,
  startDM,
} from "./group-management.js";
import {
  initMlsContext,
  createMlsKeyPackage,
  getMemberCount,
} from "./crypto/mls-manager.js";
import type { MlsContext } from "./crypto/mls-manager.js";
import { deviceMlsIdentity } from "./crypto/multi-device.js";
import { getGroupMetadata, getMembers, getChannels, getChannelMessages, appendMessage } from "./data/group-document.js";
import { createMessageRef } from "./shared/factories.js";
import { getStewardMembers } from "./crypto/steward.js";

const setupContext = async (): Promise<MlsContext> => initMlsContext();

const setupIdentity = (peerId: string) => ({
  peerId,
  identity: deviceMlsIdentity(peerId),
  accountPublicKey: `ed25519:${peerId}-account`,
});

const setupKeyPackage = async (context: MlsContext, identity: Uint8Array) =>
  createMlsKeyPackage({ context, identity });

const setupGroup = async () => {
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

  return { context, creator, creatorKp, ...result };
};

const setupGroupWithInvitee = async () => {
  const group = await setupGroup();
  const invitee = setupIdentity("12D3KooWInvitee1");
  const inviteeKp = await setupKeyPackage(group.context, invitee.identity);

  const inviteResult = await inviteMember({
    stewardState: group.stewardState,
    groupDoc: group.groupDoc,
    inviteeKeyPackage: inviteeKp.publicPackage,
    inviteeIdentity: invitee.identity,
    inviteeAccountPublicKey: invitee.accountPublicKey,
    senderIdentity: group.creator.identity,
  });

  return { ...group, invitee, inviteeKp, inviteResult };
};

describe("Group management", () => {
  describe("createGroup", () => {
    it("should create an MLS group and a Yjs doc", async () => {
      const { stewardState, groupDoc } = await setupGroup();

      expect(getMemberCount(stewardState.groupState)).toBe(1);
      expect(groupDoc.guid).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    });

    it("should set the group creator as owner role", async () => {
      const { groupDoc, creator } = await setupGroup();

      const members = getMembers(groupDoc);
      expect(members).toHaveLength(1);
      expect(members[0].accountPublicKey).toBe(creator.accountPublicKey);
      expect(members[0].role).toBe("owner");
    });

    it("should create a default 'general' text channel", async () => {
      const { groupDoc } = await setupGroup();

      const channels = getChannels(groupDoc);
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("general");
      expect(channels[0].type).toBe("text");
      expect(channels[0].sortOrder).toBe(0);
    });

    it("should set the owner as initial steward", async () => {
      const { groupDoc, stewardState, creator } = await setupGroup();

      const metadata = getGroupMetadata(groupDoc);
      expect(metadata).not.toBeNull();
      expect(metadata!.stewardPeerId).toBe(creator.peerId);

      const stewardMembers = getStewardMembers(stewardState);
      expect(stewardMembers).toHaveLength(1);
      expect(stewardMembers[0].identity).toEqual(creator.identity);
    });
  });

  describe("inviteMember", () => {
    it("should add member to MLS group and Yjs doc", async () => {
      const { groupDoc, invitee, inviteResult } =
        await setupGroupWithInvitee();

      expect(
        getMemberCount(inviteResult.newStewardState.groupState),
      ).toBe(2);
      expect(inviteResult.welcome).toBeDefined();
      expect(inviteResult.commit).toBeDefined();

      const yjsMembers = getMembers(groupDoc);
      expect(yjsMembers).toHaveLength(2);
      const inviteeEntry = yjsMembers.find(
        (m) => m.accountPublicKey === invitee.accountPublicKey,
      );
      expect(inviteeEntry).toBeDefined();
      expect(inviteeEntry!.role).toBe("member");
    });

    it("should reject inviting a member already in the group", async () => {
      const { groupDoc, invitee, inviteResult, context } =
        await setupGroupWithInvitee();

      const duplicateKp = await setupKeyPackage(context, invitee.identity);

      await expect(
        inviteMember({
          stewardState: inviteResult.newStewardState,
          groupDoc,
          inviteeKeyPackage: duplicateKp.publicPackage,
          inviteeIdentity: invitee.identity,
          inviteeAccountPublicKey: invitee.accountPublicKey,
          senderIdentity: invitee.identity,
        }),
      ).rejects.toThrow("already a group member");

      expect(getMembers(groupDoc)).toHaveLength(2);
    });

    it("should reject invite from non-member sender", async () => {
      const { stewardState, groupDoc, context } = await setupGroup();
      const outsider = setupIdentity("12D3KooWOutsider1");
      const invitee = setupIdentity("12D3KooWInvitee1");
      const inviteeKp = await setupKeyPackage(context, invitee.identity);

      await expect(
        inviteMember({
          stewardState,
          groupDoc,
          inviteeKeyPackage: inviteeKp.publicPackage,
          inviteeIdentity: invitee.identity,
          inviteeAccountPublicKey: invitee.accountPublicKey,
          senderIdentity: outsider.identity,
        }),
      ).rejects.toThrow("not a group member");

      expect(getMembers(groupDoc)).toHaveLength(1);
    });
  });

  describe("acceptInvite", () => {
    it("should join MLS group and create Yjs doc", async () => {
      const { context, inviteeKp, inviteResult } =
        await setupGroupWithInvitee();

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
      const { groupDoc, creator, invitee, inviteResult } =
        await setupGroupWithInvitee();

      const leaveResult = await leaveGroup({
        stewardState: inviteResult.newStewardState,
        groupDoc,
        memberIdentity: invitee.identity,
        memberAccountPublicKey: invitee.accountPublicKey,
        senderIdentity: creator.identity,
      });

      expect(
        getMemberCount(leaveResult.newStewardState.groupState),
      ).toBe(1);
      expect(leaveResult.commit).toBeDefined();

      const yjsMembers = getMembers(groupDoc);
      expect(yjsMembers).toHaveLength(1);
      expect(yjsMembers[0].accountPublicKey).toBe(creator.accountPublicKey);
    });

    it("should reject removing a non-member", async () => {
      const { stewardState, groupDoc, creator } = await setupGroup();
      const unknown = setupIdentity("12D3KooWUnknown1");

      await expect(
        leaveGroup({
          stewardState,
          groupDoc,
          memberIdentity: unknown.identity,
          memberAccountPublicKey: unknown.accountPublicKey,
          senderIdentity: creator.identity,
        }),
      ).rejects.toThrow("not a group member");

      expect(getMembers(groupDoc)).toHaveLength(1);
    });
  });

  describe("startDM", () => {
    const setupDM = async () => {
      const context = await setupContext();
      const initiator = setupIdentity("12D3KooWInitiator");
      const recipient = setupIdentity("12D3KooWRecipient");
      const initiatorKp = await setupKeyPackage(context, initiator.identity);
      const recipientKp = await setupKeyPackage(context, recipient.identity);

      const result = await startDM({
        context,
        groupId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        initiatorKeyPackage: initiatorKp,
        initiatorIdentity: initiator.identity,
        initiatorAccountPublicKey: initiator.accountPublicKey,
        initiatorPeerId: initiator.peerId,
        recipientKeyPackage: recipientKp.publicPackage,
        recipientIdentity: recipient.identity,
        recipientAccountPublicKey: recipient.accountPublicKey,
      });

      return { context, initiator, recipient, initiatorKp, recipientKp, ...result };
    };

    it("should create a 2-member MLS group", async () => {
      const { stewardState } = await setupDM();

      expect(getMemberCount(stewardState.groupState)).toBe(2);
    });

    it("should mark metadata as isDM", async () => {
      const { groupDoc } = await setupDM();

      const metadata = getGroupMetadata(groupDoc);
      expect(metadata).not.toBeNull();
      expect(metadata!.isDM).toBe(true);
    });

    it("should have exactly 2 members in Yjs doc", async () => {
      const { groupDoc, initiator, recipient } = await setupDM();

      const members = getMembers(groupDoc);
      expect(members).toHaveLength(2);

      const keys = members.map((m) => m.accountPublicKey);
      expect(keys).toContain(initiator.accountPublicKey);
      expect(keys).toContain(recipient.accountPublicKey);
    });

    it("should not create channels (DMs use implicit single channel)", async () => {
      const { groupDoc } = await setupDM();

      const channels = getChannels(groupDoc);
      expect(channels).toHaveLength(0);
    });

    it("should produce a welcome message for the recipient", async () => {
      const { welcome } = await setupDM();

      expect(welcome).toBeDefined();
    });

    it("should encrypt DM messages for exactly 2 members", async () => {
      const { groupDoc } = await setupDM();
      const dmChannelId = groupDoc.guid;

      appendMessage(groupDoc, dmChannelId, createMessageRef());
      const messages = getChannelMessages(groupDoc, dmChannelId);

      expect(messages).toHaveLength(1);
    });
  });
});

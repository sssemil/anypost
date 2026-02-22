import * as Y from "yjs";
import {
  createMlsGroup,
  joinFromWelcome,
} from "./crypto/mls-manager.js";
import type {
  MlsContext,
  MlsGroupState,
  MlsKeyPackageBundle,
} from "./crypto/mls-manager.js";
import { createStewardState, processStewardProposal } from "./crypto/steward.js";
import type { StewardState } from "./crypto/steward.js";
import {
  createGroupDocument,
  setGroupMetadata,
  addMember,
  removeMember,
  createChannelInGroup,
} from "./data/group-document.js";
import type {
  GroupId,
  AccountPublicKey,
  PeerId,
  GroupMetadata,
  Member,
} from "./shared/schemas.js";
import type { KeyPackage, Welcome, MlsFramedMessage } from "ts-mls";

type CreateGroupOptions = {
  readonly context: MlsContext;
  readonly groupId: GroupId;
  readonly groupName: string;
  readonly creatorKeyPackage: MlsKeyPackageBundle;
  readonly creatorIdentity: Uint8Array;
  readonly creatorAccountPublicKey: AccountPublicKey;
  readonly creatorPeerId: PeerId;
};

type CreateGroupResult = {
  readonly groupDoc: Y.Doc;
  readonly stewardState: StewardState;
};

type InviteMemberOptions = {
  readonly stewardState: StewardState;
  readonly groupDoc: Y.Doc;
  readonly inviteeKeyPackage: KeyPackage;
  readonly inviteeIdentity: Uint8Array;
  readonly inviteeAccountPublicKey: AccountPublicKey;
  readonly senderIdentity: Uint8Array;
};

type InviteMemberResult = {
  readonly newStewardState: StewardState;
  readonly welcome: Welcome;
  readonly commit: MlsFramedMessage;
};

type AcceptInviteOptions = {
  readonly context: MlsContext;
  readonly welcome: Welcome;
  readonly keyPackage: MlsKeyPackageBundle;
  readonly groupId: GroupId;
};

type AcceptInviteResult = {
  readonly groupState: MlsGroupState;
  readonly groupDoc: Y.Doc;
};

type LeaveGroupOptions = {
  readonly stewardState: StewardState;
  readonly groupDoc: Y.Doc;
  readonly memberIdentity: Uint8Array;
  readonly memberAccountPublicKey: AccountPublicKey;
  readonly senderIdentity: Uint8Array;
};

type LeaveGroupResult = {
  readonly newStewardState: StewardState;
  readonly commit: MlsFramedMessage;
};

export const createGroup = async (
  options: CreateGroupOptions,
): Promise<CreateGroupResult> => {
  const now = Date.now();
  const groupIdBytes = new TextEncoder().encode(options.groupId);

  const mlsGroupState = await createMlsGroup({
    context: options.context,
    groupId: groupIdBytes,
    keyPackage: options.creatorKeyPackage,
  });

  const stewardState = createStewardState({
    context: options.context,
    groupState: mlsGroupState,
    stewardIdentity: options.creatorIdentity,
  });

  const groupDoc = createGroupDocument(options.groupId);

  const metadata: GroupMetadata = {
    name: options.groupName,
    description: "",
    createdAt: now,
    stewardPeerId: options.creatorPeerId,
  };
  setGroupMetadata(groupDoc, metadata);

  const ownerMember: Member = {
    accountPublicKey: options.creatorAccountPublicKey,
    role: "owner",
    joinedAt: now,
  };
  addMember(groupDoc, ownerMember);
  createChannelInGroup(groupDoc, { name: "general", type: "text" });

  return { groupDoc, stewardState };
};

export const inviteMember = async (
  options: InviteMemberOptions,
): Promise<InviteMemberResult> => {
  const result = await processStewardProposal({
    state: options.stewardState,
    proposal: {
      kind: "add",
      keyPackage: options.inviteeKeyPackage,
      identity: options.inviteeIdentity,
    },
    senderIdentity: options.senderIdentity,
  });

  if (!result.welcomeMessage) {
    throw new Error("Invite did not produce a welcome message");
  }

  const newMember: Member = {
    accountPublicKey: options.inviteeAccountPublicKey,
    role: "member",
    joinedAt: Date.now(),
  };
  addMember(options.groupDoc, newMember);

  return {
    newStewardState: result.newState,
    welcome: result.welcomeMessage.welcome,
    commit: result.commitBroadcast.commit,
  };
};

export const acceptInvite = async (
  options: AcceptInviteOptions,
): Promise<AcceptInviteResult> => {
  const groupState = await joinFromWelcome({
    context: options.context,
    welcome: options.welcome,
    keyPackage: options.keyPackage,
  });

  const groupDoc = createGroupDocument(options.groupId);

  return { groupState, groupDoc };
};

export const leaveGroup = async (
  options: LeaveGroupOptions,
): Promise<LeaveGroupResult> => {
  const result = await processStewardProposal({
    state: options.stewardState,
    proposal: {
      kind: "remove",
      identity: options.memberIdentity,
    },
    senderIdentity: options.senderIdentity,
  });

  removeMember(options.groupDoc, options.memberAccountPublicKey);

  return {
    newStewardState: result.newState,
    commit: result.commitBroadcast.commit,
  };
};

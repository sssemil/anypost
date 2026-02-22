import {
  addMember,
  removeMember,
  updateKeys,
} from "./mls-manager.js";
import type { MlsContext, MlsGroupState } from "./mls-manager.js";
import type { KeyPackage, MlsFramedMessage, Welcome } from "ts-mls";

export type StewardProposal =
  | {
      readonly kind: "add";
      readonly keyPackage: KeyPackage;
      readonly identity: Uint8Array;
    }
  | { readonly kind: "remove"; readonly identity: Uint8Array }
  | { readonly kind: "update" };

export type MemberRecord = {
  readonly identity: Uint8Array;
  readonly memberIndex: number;
};

export type StewardState = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly stewardIdentity: Uint8Array;
  readonly members: readonly MemberRecord[];
};

type CommitBroadcast = {
  readonly commit: MlsFramedMessage;
};

type WelcomeMessage = {
  readonly welcome: Welcome;
  readonly recipientIdentity: Uint8Array;
};

export type ProcessProposalResult = {
  readonly newState: StewardState;
  readonly commitBroadcast: CommitBroadcast;
  readonly welcomeMessage?: WelcomeMessage;
};

export type ProposalQueue = {
  readonly proposals: readonly StewardProposal[];
};

type CreateStewardStateOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly stewardIdentity: Uint8Array;
};

export const createStewardState = (
  options: CreateStewardStateOptions,
): StewardState => ({
  context: options.context,
  groupState: options.groupState,
  stewardIdentity: options.stewardIdentity,
  members: [{ identity: options.stewardIdentity, memberIndex: 0 }],
});

const identitiesMatch = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

const findMemberByIdentity = (
  members: readonly MemberRecord[],
  identity: Uint8Array,
): MemberRecord | undefined =>
  members.find((m) => identitiesMatch(m.identity, identity));

const isMember = (
  members: readonly MemberRecord[],
  identity: Uint8Array,
): boolean => findMemberByIdentity(members, identity) !== undefined;

type ProcessStewardProposalOptions = {
  readonly state: StewardState;
  readonly proposal: StewardProposal;
  readonly senderIdentity: Uint8Array;
};

export const processStewardProposal = async (
  options: ProcessStewardProposalOptions,
): Promise<ProcessProposalResult> => {
  if (!isMember(options.state.members, options.senderIdentity)) {
    throw new Error("Sender is not a group member");
  }

  switch (options.proposal.kind) {
    case "add":
      return processAddProposal(options.state, options.proposal);
    case "remove":
      return processRemoveProposal(options.state, options.proposal);
    case "update":
      return processUpdateProposal(options.state);
  }
};

type AddProposal = Extract<StewardProposal, { readonly kind: "add" }>;

const processAddProposal = async (
  state: StewardState,
  proposal: AddProposal,
): Promise<ProcessProposalResult> => {
  if (isMember(state.members, proposal.identity)) {
    throw new Error("Cannot add: identity is already a group member");
  }

  const result = await addMember({
    context: state.context,
    groupState: state.groupState,
    newMemberKeyPackage: proposal.keyPackage,
  });

  const newMembers = [
    ...state.members,
    { identity: proposal.identity, memberIndex: result.newMemberLeafIndex },
  ];

  return {
    newState: {
      ...state,
      groupState: result.newGroupState,
      members: newMembers,
    },
    commitBroadcast: { commit: result.commit },
    welcomeMessage: {
      welcome: result.welcome,
      recipientIdentity: proposal.identity,
    },
  };
};

type RemoveProposal = Extract<StewardProposal, { readonly kind: "remove" }>;

const processRemoveProposal = async (
  state: StewardState,
  proposal: RemoveProposal,
): Promise<ProcessProposalResult> => {
  const member = findMemberByIdentity(state.members, proposal.identity);
  if (!member) {
    throw new Error("Cannot remove: identity is not a group member");
  }

  const result = await removeMember({
    context: state.context,
    groupState: state.groupState,
    memberIndex: member.memberIndex,
  });

  const remainingMembers = state.members.filter(
    (m) => !identitiesMatch(m.identity, proposal.identity),
  );

  return {
    newState: {
      ...state,
      groupState: result.newGroupState,
      members: remainingMembers,
    },
    commitBroadcast: { commit: result.commit },
  };
};

const processUpdateProposal = async (
  state: StewardState,
): Promise<ProcessProposalResult> => {
  const result = await updateKeys({
    context: state.context,
    groupState: state.groupState,
  });

  return {
    newState: {
      ...state,
      groupState: result.newGroupState,
    },
    commitBroadcast: { commit: result.commit },
  };
};

export const getStewardMembers = (
  state: StewardState,
): readonly MemberRecord[] => state.members;

export const createProposalQueue = (): ProposalQueue => ({
  proposals: [],
});

export const enqueueProposal = (
  queue: ProposalQueue,
  proposal: StewardProposal,
): ProposalQueue => ({
  proposals: [...queue.proposals, proposal],
});

export const drainProposalQueue = (
  queue: ProposalQueue,
): { readonly proposals: readonly StewardProposal[]; readonly emptyQueue: ProposalQueue } => ({
  proposals: queue.proposals,
  emptyQueue: { proposals: [] },
});

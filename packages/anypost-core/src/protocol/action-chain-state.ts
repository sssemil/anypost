import { Result } from "../shared/result.js";
import { toHex } from "./action-chain.js";
import type {
  ActionChainGroupState,
  SignedAction,
} from "./action-chain.js";

export const createActionChainGroupState = (
  groupId: string,
): ActionChainGroupState => ({
  groupId,
  groupName: "",
  isDirectMessage: false,
  directMessagePeerIds: null,
  dmGenesisContributorPublicKeys: new Set(),
  dmHandshakeComplete: false,
  joinPolicy: "manual",
  createdAt: 0,
  members: new Map(),
  pendingJoins: new Map(),
  readReceipts: new Map(),
  lastMergeTimestampByAuthor: new Map(),
});

export const applyAction = (
  state: ActionChainGroupState,
  action: SignedAction,
): Result<ActionChainGroupState, Error> => {
  const authorHex = toHex(action.authorPublicKey);

  switch (action.payload.type) {
    case "group-created":
      return applyGroupCreated(state, action, authorHex);
    case "dm-created":
      return applyDirectMessageCreated(state, action, authorHex);
    case "join-request":
      return applyJoinRequest(state, action, authorHex);
    case "member-approved":
      return applyMemberApproved(state, action, authorHex);
    case "member-left":
      return applyMemberLeft(state, authorHex);
    case "member-removed":
      return applyMemberRemoved(state, action, authorHex);
    case "role-changed":
      return applyRoleChanged(state, action, authorHex);
    case "group-renamed":
      return applyGroupRenamed(state, action, authorHex);
    case "join-policy-changed":
      return applyJoinPolicyChanged(state, action, authorHex);
    case "message":
      return applyMessage(state, authorHex);
    case "message-edited":
      return applyMessageEdited(state, authorHex);
    case "message-deleted":
      return applyMessageDeleted(state, authorHex);
    case "read-receipt":
      return applyReadReceipt(state, action, authorHex);
    case "merge":
      return applyMerge(state, action, authorHex);
  }
};

export const deriveGroupState = (
  groupId: string,
  actions: readonly SignedAction[],
): Result<ActionChainGroupState, Error> => {
  let state = createActionChainGroupState(groupId);

  for (const action of actions) {
    const result = applyAction(state, action);
    if (result.success) {
      state = result.data;
    }
  }

  return Result.success(state);
};

const applyGroupCreated = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.members.size > 0) {
    return Result.failure(new Error("Group already created"));
  }

  const payload = action.payload as {
    readonly groupName: string;
    readonly joinPolicy?: "manual" | "auto_with_invite";
  };
  const members = new Map(state.members);
  members.set(authorHex, {
    publicKeyHex: authorHex,
    publicKey: action.authorPublicKey,
    role: "owner",
    joinedAt: action.timestamp,
  });

  return Result.success({
    ...state,
    groupName: payload.groupName,
    isDirectMessage: false,
    directMessagePeerIds: null,
    dmGenesisContributorPublicKeys: new Set(),
    dmHandshakeComplete: false,
    joinPolicy: payload.joinPolicy ?? "manual",
    createdAt: action.timestamp,
    members,
  });
};

const applyDirectMessageCreated = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  const payload = action.payload as {
    readonly peerIds: readonly [string, string];
  };
  const [firstPeerId, secondPeerId] = payload.peerIds;
  if (firstPeerId.localeCompare(secondPeerId) >= 0) {
    return Result.failure(new Error("Invalid DM peer ID ordering"));
  }
  if (state.createdAt > 0 && !state.isDirectMessage) {
    return Result.failure(new Error("Group already created as non-DM"));
  }
  if (
    state.isDirectMessage &&
    state.directMessagePeerIds !== null &&
    (state.directMessagePeerIds[0] !== firstPeerId ||
      state.directMessagePeerIds[1] !== secondPeerId)
  ) {
    return Result.failure(new Error("DM peer IDs do not match existing group"));
  }

  const members = new Map(state.members);
  if (!members.has(authorHex)) {
    members.set(authorHex, {
      publicKeyHex: authorHex,
      publicKey: action.authorPublicKey,
      role: state.members.size === 0 ? "owner" : "member",
      joinedAt: action.timestamp,
    });
  }
  const contributors = new Set(state.dmGenesisContributorPublicKeys);
  contributors.add(authorHex);
  const handshakeComplete = contributors.size >= 2;
  const createdAt = state.createdAt === 0
    ? action.timestamp
    : Math.min(state.createdAt, action.timestamp);

  return Result.success({
    ...state,
    groupName: "",
    isDirectMessage: true,
    directMessagePeerIds: [firstPeerId, secondPeerId],
    dmGenesisContributorPublicKeys: contributors,
    dmHandshakeComplete: handshakeComplete,
    joinPolicy: "manual",
    createdAt,
    members,
  });
};

const applyJoinRequest = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages do not support join requests"));
  }
  if (state.members.has(authorHex)) {
    return Result.failure(new Error("Already a member"));
  }

  const payload = action.payload as {
    readonly requesterPublicKey: Uint8Array;
  };
  const pendingJoins = new Map(state.pendingJoins);
  pendingJoins.set(toHex(payload.requesterPublicKey), payload.requesterPublicKey);

  return Result.success({ ...state, pendingJoins });
};

const applyMemberApproved = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages do not support member approval"));
  }
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can approve members"));
  }

  const payload = action.payload as {
    readonly memberPublicKey: Uint8Array;
    readonly role: "admin" | "member";
  };
  const memberHex = toHex(payload.memberPublicKey);

  const members = new Map(state.members);
  members.set(memberHex, {
    publicKeyHex: memberHex,
    publicKey: payload.memberPublicKey,
    role: payload.role,
    joinedAt: action.timestamp,
  });

  const pendingJoins = new Map(state.pendingJoins);
  pendingJoins.delete(memberHex);

  return Result.success({ ...state, members, pendingJoins });
};

const applyMemberLeft = (
  state: ActionChainGroupState,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  const leavingMember = state.members.get(authorHex);
  if (!leavingMember) {
    return Result.failure(new Error("Not a member"));
  }

  const members = new Map(state.members);
  members.delete(authorHex);
  return Result.success({ ...state, members: normalizeOwnerInvariant(members) });
};

const applyMemberRemoved = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages do not support member removal"));
  }
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can remove members"));
  }

  const payload = action.payload as {
    readonly memberPublicKey: Uint8Array;
  };
  const targetHex = toHex(payload.memberPublicKey);
  const actor = state.members.get(authorHex);
  const target = state.members.get(targetHex);
  if (!target) {
    return Result.failure(new Error("Target is not a member"));
  }
  if (target.role === "owner" && actor?.role !== "owner") {
    return Result.failure(new Error("Only owner can remove owner"));
  }

  const members = new Map(state.members);
  members.delete(targetHex);

  return Result.success({ ...state, members: normalizeOwnerInvariant(members) });
};

const applyRoleChanged = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages do not support role changes"));
  }
  const payload = action.payload as {
    readonly memberPublicKey: Uint8Array;
    readonly newRole: "owner" | "admin" | "member";
  };
  const targetHex = toHex(payload.memberPublicKey);

  if (targetHex === authorHex) {
    return Result.failure(new Error("Cannot change own role"));
  }

  const actor = state.members.get(authorHex);
  if (!actor) {
    return Result.failure(new Error("Only owner can change roles"));
  }
  if (actor.role !== "owner") {
    return Result.failure(new Error("Only owner can change roles"));
  }

  const existing = state.members.get(targetHex);
  if (!existing) {
    return Result.failure(new Error("Target is not a member"));
  }

  const members = new Map(state.members);
  if (payload.newRole === "owner") {
    const currentOwner = getCurrentOwner(members);
    if (currentOwner && currentOwner.publicKeyHex !== targetHex) {
      members.set(currentOwner.publicKeyHex, { ...currentOwner, role: "admin" });
    }
    members.set(targetHex, { ...existing, role: "owner" });
  } else {
    members.set(targetHex, { ...existing, role: payload.newRole });
  }

  return Result.success({ ...state, members: normalizeOwnerInvariant(members) });
};

const applyGroupRenamed = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can rename the group"));
  }
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages cannot be renamed"));
  }

  const payload = action.payload as { readonly newName: string };

  return Result.success({ ...state, groupName: payload.newName });
};

const applyJoinPolicyChanged = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage) {
    return Result.failure(new Error("Direct messages do not support join policy"));
  }
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can change join policy"));
  }

  const payload = action.payload as {
    readonly joinPolicy: "manual" | "auto_with_invite";
  };
  return Result.success({ ...state, joinPolicy: payload.joinPolicy });
};

const applyMessage = (
  state: ActionChainGroupState,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage && !state.dmHandshakeComplete) {
    return Result.failure(new Error("DM handshake incomplete"));
  }
  if (!isMember(state, authorHex)) {
    return Result.failure(new Error("Only members can send messages"));
  }

  return Result.success(state);
};

const applyReadReceipt = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isMember(state, authorHex)) {
    return Result.failure(new Error("Only members can send read receipts"));
  }

  const payload = action.payload as { readonly upToHash: Uint8Array };
  const readReceipts = new Map(state.readReceipts);
  readReceipts.set(authorHex, toHex(payload.upToHash));

  return Result.success({ ...state, readReceipts });
};

const applyMessageEdited = (
  state: ActionChainGroupState,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage && !state.dmHandshakeComplete) {
    return Result.failure(new Error("DM handshake incomplete"));
  }
  if (!isMember(state, authorHex)) {
    return Result.failure(new Error("Only members can edit messages"));
  }
  return Result.success(state);
};

const applyMessageDeleted = (
  state: ActionChainGroupState,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (state.isDirectMessage && !state.dmHandshakeComplete) {
    return Result.failure(new Error("DM handshake incomplete"));
  }
  if (!isMember(state, authorHex)) {
    return Result.failure(new Error("Only members can delete messages"));
  }
  return Result.success(state);
};

const applyMerge = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isMember(state, authorHex)) {
    return Result.failure(new Error("Only members can create merge actions"));
  }

  const lastMergeTimestampByAuthor = new Map(state.lastMergeTimestampByAuthor);
  lastMergeTimestampByAuthor.set(authorHex, action.timestamp);

  return Result.success({ ...state, lastMergeTimestampByAuthor });
};

const isAdmin = (state: ActionChainGroupState, publicKeyHex: string): boolean => {
  const member = state.members.get(publicKeyHex);
  return member?.role === "admin" || member?.role === "owner";
};

const isMember = (state: ActionChainGroupState, publicKeyHex: string): boolean =>
  state.members.has(publicKeyHex);

const sortMembersByJoinOrder = (
  a: { readonly joinedAt: number; readonly publicKeyHex: string },
  b: { readonly joinedAt: number; readonly publicKeyHex: string },
): number => {
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
  return a.publicKeyHex.localeCompare(b.publicKeyHex);
};

const getCurrentOwner = (
  members: ReadonlyMap<string, {
    readonly publicKeyHex: string;
    readonly publicKey: Uint8Array;
    readonly role: "owner" | "admin" | "member";
    readonly joinedAt: number;
  }>,
): {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
  readonly role: "owner" | "admin" | "member";
  readonly joinedAt: number;
} | null => {
  const owners = [...members.values()].filter((member) => member.role === "owner");
  if (owners.length === 0) return null;
  owners.sort(sortMembersByJoinOrder);
  return owners[0] ?? null;
};

const normalizeOwnerInvariant = (
  members: ReadonlyMap<string, {
    readonly publicKeyHex: string;
    readonly publicKey: Uint8Array;
    readonly role: "owner" | "admin" | "member";
    readonly joinedAt: number;
  }>,
): Map<string, {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
  readonly role: "owner" | "admin" | "member";
  readonly joinedAt: number;
}> => {
  const normalized = new Map(members);
  if (normalized.size === 0) return normalized;

  const owners = [...normalized.values()]
    .filter((member) => member.role === "owner")
    .sort(sortMembersByJoinOrder);

  if (owners.length === 0) {
    const promoted = [...normalized.values()].sort(sortMembersByJoinOrder)[0];
    normalized.set(promoted.publicKeyHex, { ...promoted, role: "owner" });
    return normalized;
  }

  const canonicalOwner = owners[0];
  for (const duplicateOwner of owners.slice(1)) {
    normalized.set(duplicateOwner.publicKeyHex, { ...duplicateOwner, role: "admin" });
  }
  normalized.set(canonicalOwner.publicKeyHex, { ...canonicalOwner, role: "owner" });
  return normalized;
};

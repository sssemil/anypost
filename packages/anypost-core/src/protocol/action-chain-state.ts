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
  joinPolicy: "manual",
  createdAt: 0,
  members: new Map(),
  pendingJoins: new Map(),
  readReceipts: new Map(),
});

export const applyAction = (
  state: ActionChainGroupState,
  action: SignedAction,
): Result<ActionChainGroupState, Error> => {
  const authorHex = toHex(action.authorPublicKey);

  switch (action.payload.type) {
    case "group-created":
      return applyGroupCreated(state, action, authorHex);
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
    case "read-receipt":
      return applyReadReceipt(state, action, authorHex);
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
    role: "admin",
    joinedAt: action.timestamp,
  });

  return Result.success({
    ...state,
    groupName: payload.groupName,
    joinPolicy: payload.joinPolicy ?? "manual",
    createdAt: action.timestamp,
    members,
  });
};

const applyJoinRequest = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
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

  const hasAdmin = [...members.values()].some((member) => member.role === "admin");
  if (!hasAdmin && members.size > 0 && leavingMember.role === "admin") {
    const nextOwner = [...members.values()].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return a.publicKeyHex.localeCompare(b.publicKeyHex);
    })[0];
    members.set(nextOwner.publicKeyHex, { ...nextOwner, role: "admin" });
  }

  return Result.success({ ...state, members });
};

const applyMemberRemoved = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can remove members"));
  }

  const payload = action.payload as {
    readonly memberPublicKey: Uint8Array;
  };
  const targetHex = toHex(payload.memberPublicKey);

  const members = new Map(state.members);
  members.delete(targetHex);

  return Result.success({ ...state, members });
};

const applyRoleChanged = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can change roles"));
  }

  const payload = action.payload as {
    readonly memberPublicKey: Uint8Array;
    readonly newRole: "admin" | "member";
  };
  const targetHex = toHex(payload.memberPublicKey);

  if (targetHex === authorHex) {
    return Result.failure(new Error("Cannot change own role"));
  }

  const existing = state.members.get(targetHex);
  if (!existing) {
    return Result.failure(new Error("Target is not a member"));
  }

  const members = new Map(state.members);
  members.set(targetHex, { ...existing, role: payload.newRole });

  return Result.success({ ...state, members });
};

const applyGroupRenamed = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
  if (!isAdmin(state, authorHex)) {
    return Result.failure(new Error("Only admins can rename the group"));
  }

  const payload = action.payload as { readonly newName: string };

  return Result.success({ ...state, groupName: payload.newName });
};

const applyJoinPolicyChanged = (
  state: ActionChainGroupState,
  action: SignedAction,
  authorHex: string,
): Result<ActionChainGroupState, Error> => {
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

  const payload = action.payload as { readonly upToActionId: string };
  const readReceipts = new Map(state.readReceipts);
  readReceipts.set(authorHex, payload.upToActionId);

  return Result.success({ ...state, readReceipts });
};

const isAdmin = (state: ActionChainGroupState, publicKeyHex: string): boolean => {
  const member = state.members.get(publicKeyHex);
  return member?.role === "admin";
};

const isMember = (state: ActionChainGroupState, publicKeyHex: string): boolean =>
  state.members.has(publicKeyHex);

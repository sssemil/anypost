import type { ChatMessageEvent } from "./plaintext-chat.js";
import { groupTopic } from "./router.js";

export type GroupEntry = {
  readonly groupId: string;
  readonly topic: string;
  readonly messages: readonly ChatMessageEvent[];
  readonly unreadCount: number;
  readonly seenPeerIds: ReadonlySet<string>;
  readonly hasActionChain: boolean;
  readonly groupName: string | undefined;
  readonly pendingApproval: boolean;
};

export type MultiGroupState = {
  readonly groups: ReadonlyMap<string, GroupEntry>;
  readonly activeGroupId: string | null;
  readonly joinOrder: readonly string[];
};

export type MultiGroupEvent =
  | { readonly type: "group-joined"; readonly groupId: string; readonly groupName?: string; readonly hasActionChain?: boolean }
  | { readonly type: "group-created"; readonly groupId: string; readonly groupName: string }
  | { readonly type: "group-left"; readonly groupId: string }
  | { readonly type: "group-selected"; readonly groupId: string }
  | { readonly type: "message-received"; readonly groupId: string; readonly message: ChatMessageEvent }
  | { readonly type: "message-sent"; readonly groupId: string; readonly message: ChatMessageEvent }
  | { readonly type: "approval-received"; readonly groupId: string };

export const createMultiGroupState = (): MultiGroupState => ({
  groups: new Map(),
  activeGroupId: null,
  joinOrder: [],
});

const handleGroupJoined = (
  state: MultiGroupState,
  groupId: string,
  groupName?: string,
  hasActionChain?: boolean,
): MultiGroupState => {
  if (state.groups.has(groupId)) return state;

  const entry: GroupEntry = {
    groupId,
    topic: groupTopic(groupId),
    messages: [],
    unreadCount: 0,
    seenPeerIds: new Set(),
    hasActionChain: hasActionChain ?? false,
    groupName,
    pendingApproval: true,
  };

  const groups = new Map(state.groups);
  groups.set(groupId, entry);

  return {
    groups,
    activeGroupId: state.activeGroupId ?? groupId,
    joinOrder: [...state.joinOrder, groupId],
  };
};

const handleGroupCreated = (
  state: MultiGroupState,
  groupId: string,
  groupName: string,
): MultiGroupState => {
  if (state.groups.has(groupId)) return state;

  const entry: GroupEntry = {
    groupId,
    topic: groupTopic(groupId),
    messages: [],
    unreadCount: 0,
    seenPeerIds: new Set(),
    hasActionChain: true,
    groupName,
    pendingApproval: false,
  };

  const groups = new Map(state.groups);
  groups.set(groupId, entry);

  return {
    groups,
    activeGroupId: state.activeGroupId ?? groupId,
    joinOrder: [...state.joinOrder, groupId],
  };
};

const handleGroupLeft = (
  state: MultiGroupState,
  groupId: string,
): MultiGroupState => {
  if (!state.groups.has(groupId)) return state;

  const groups = new Map(state.groups);
  groups.delete(groupId);

  const joinOrder = state.joinOrder.filter((id) => id !== groupId);

  const activeGroupId =
    state.activeGroupId === groupId
      ? joinOrder[0] ?? null
      : state.activeGroupId;

  return { groups, activeGroupId, joinOrder };
};

const handleGroupSelected = (
  state: MultiGroupState,
  groupId: string,
): MultiGroupState => {
  const group = state.groups.get(groupId);
  if (!group) return state;

  const groups = new Map(state.groups);
  groups.set(groupId, { ...group, unreadCount: 0 });

  return { ...state, groups, activeGroupId: groupId };
};

const addMessageToGroup = (
  state: MultiGroupState,
  groupId: string,
  message: ChatMessageEvent,
  incrementUnread: boolean,
): MultiGroupState => {
  const group = state.groups.get(groupId);
  if (!group) return state;

  const isActive = state.activeGroupId === groupId;
  const updatedSeenPeerIds = group.seenPeerIds.has(message.senderPeerId)
    ? group.seenPeerIds
    : new Set([...group.seenPeerIds, message.senderPeerId]);
  const groups = new Map(state.groups);
  groups.set(groupId, {
    ...group,
    messages: [...group.messages, message],
    unreadCount: incrementUnread && !isActive
      ? group.unreadCount + 1
      : group.unreadCount,
    seenPeerIds: updatedSeenPeerIds,
  });

  return { ...state, groups };
};

const handleApprovalReceived = (
  state: MultiGroupState,
  groupId: string,
): MultiGroupState => {
  const group = state.groups.get(groupId);
  if (!group) return state;

  const groups = new Map(state.groups);
  groups.set(groupId, { ...group, pendingApproval: false });

  return { ...state, groups };
};

export const transitionMultiGroup = (
  state: MultiGroupState,
  event: MultiGroupEvent,
): MultiGroupState => {
  switch (event.type) {
    case "group-joined":
      return handleGroupJoined(state, event.groupId, event.groupName, event.hasActionChain);
    case "group-created":
      return handleGroupCreated(state, event.groupId, event.groupName);
    case "group-left":
      return handleGroupLeft(state, event.groupId);
    case "group-selected":
      return handleGroupSelected(state, event.groupId);
    case "message-received":
      return addMessageToGroup(state, event.groupId, event.message, true);
    case "message-sent":
      return addMessageToGroup(state, event.groupId, event.message, false);
    case "approval-received":
      return handleApprovalReceived(state, event.groupId);
  }
};

export const getActiveGroup = (
  state: MultiGroupState,
): GroupEntry | null => {
  if (state.activeGroupId === null) return null;
  return state.groups.get(state.activeGroupId) ?? null;
};

export const getActiveMessages = (
  state: MultiGroupState,
): readonly ChatMessageEvent[] => {
  const group = getActiveGroup(state);
  return group?.messages ?? [];
};

export const getGroupList = (
  state: MultiGroupState,
): readonly GroupEntry[] =>
  state.joinOrder
    .map((id) => state.groups.get(id))
    .filter((g): g is GroupEntry => g !== undefined);

export const getGroupMembers = (
  state: MultiGroupState,
  groupId: string,
): ReadonlyMap<string, string | undefined> => {
  const group = state.groups.get(groupId);
  if (!group) return new Map();

  const members = new Map<string, string | undefined>();
  for (const msg of group.messages) {
    members.set(msg.senderPeerId, msg.senderDisplayName);
  }
  return members;
};

export const getSeenPeerIds = (
  state: MultiGroupState,
  groupId: string,
): ReadonlySet<string> =>
  state.groups.get(groupId)?.seenPeerIds ?? new Set();

export const hasGroup = (
  state: MultiGroupState,
  groupId: string,
): boolean => state.groups.has(groupId);

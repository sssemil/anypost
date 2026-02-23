import type { MultiGroupState, ChatMessageEvent } from "anypost-core/protocol";

export type PersistedGroupData = {
  readonly joinedGroups: readonly string[];
  readonly activeGroupId: string | null;
  readonly messages: Readonly<Record<string, readonly ChatMessageEvent[]>>;
  readonly seenPeerIds: Readonly<Record<string, readonly string[]>>;
  readonly actionChainGroups: readonly string[];
  readonly groupNames: Readonly<Record<string, string>>;
};

export const createDefaultPersistedData = (): PersistedGroupData => ({
  joinedGroups: [],
  activeGroupId: null,
  messages: {},
  seenPeerIds: {},
  actionChainGroups: [],
  groupNames: {},
});

export const serializeGroups = (state: MultiGroupState): string => {
  const messages: Record<string, readonly ChatMessageEvent[]> = {};
  const seenPeerIds: Record<string, readonly string[]> = {};
  const actionChainGroups: string[] = [];
  const groupNames: Record<string, string> = {};

  for (const [groupId, entry] of state.groups) {
    if (entry.messages.length > 0) {
      messages[groupId] = entry.messages;
    }
    if (entry.seenPeerIds.size > 0) {
      seenPeerIds[groupId] = [...entry.seenPeerIds];
    }
    if (entry.hasActionChain) {
      actionChainGroups.push(groupId);
    }
    if (entry.groupName !== undefined) {
      groupNames[groupId] = entry.groupName;
    }
  }

  return JSON.stringify({
    joinedGroups: state.joinOrder,
    activeGroupId: state.activeGroupId,
    messages,
    seenPeerIds,
    actionChainGroups,
    groupNames,
  });
};

export const deserializeGroups = (json: string): PersistedGroupData => {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const joinedGroups = Array.isArray(parsed.joinedGroups)
      ? (parsed.joinedGroups as string[])
      : [];
    const activeGroupId =
      typeof parsed.activeGroupId === "string" ? parsed.activeGroupId : null;

    const messages: Record<string, ChatMessageEvent[]> =
      parsed.messages && typeof parsed.messages === "object"
        ? (parsed.messages as Record<string, ChatMessageEvent[]>)
        : {};

    const seenPeerIds: Record<string, string[]> =
      parsed.seenPeerIds && typeof parsed.seenPeerIds === "object"
        ? (parsed.seenPeerIds as Record<string, string[]>)
        : {};

    const actionChainGroups = Array.isArray(parsed.actionChainGroups)
      ? (parsed.actionChainGroups as string[])
      : [];

    const groupNames: Record<string, string> =
      parsed.groupNames && typeof parsed.groupNames === "object"
        ? (parsed.groupNames as Record<string, string>)
        : {};

    return { joinedGroups, activeGroupId, messages, seenPeerIds, actionChainGroups, groupNames };
  } catch {
    return createDefaultPersistedData();
  }
};

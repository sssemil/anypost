import type { MultiGroupState, ChatMessageEvent } from "anypost-core/protocol";

export type PersistedGroupData = {
  readonly joinedGroups: readonly string[];
  readonly activeGroupId: string | null;
  readonly messages: Readonly<Record<string, readonly ChatMessageEvent[]>>;
  readonly seenPeerIds: Readonly<Record<string, readonly string[]>>;
};

export const createDefaultPersistedData = (): PersistedGroupData => ({
  joinedGroups: [],
  activeGroupId: null,
  messages: {},
  seenPeerIds: {},
});

export const serializeGroups = (state: MultiGroupState): string => {
  const messages: Record<string, readonly ChatMessageEvent[]> = {};
  const seenPeerIds: Record<string, readonly string[]> = {};

  for (const [groupId, entry] of state.groups) {
    if (entry.messages.length > 0) {
      messages[groupId] = entry.messages;
    }
    if (entry.seenPeerIds.size > 0) {
      seenPeerIds[groupId] = [...entry.seenPeerIds];
    }
  }

  return JSON.stringify({
    joinedGroups: state.joinOrder,
    activeGroupId: state.activeGroupId,
    messages,
    seenPeerIds,
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

    return { joinedGroups, activeGroupId, messages, seenPeerIds };
  } catch {
    return createDefaultPersistedData();
  }
};

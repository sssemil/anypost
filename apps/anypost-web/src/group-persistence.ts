import type { MultiGroupState } from "anypost-core/protocol";

export type PersistedGroupData = {
  readonly joinedGroups: readonly string[];
  readonly activeGroupId: string | null;
};

export const createDefaultPersistedData = (): PersistedGroupData => ({
  joinedGroups: [],
  activeGroupId: null,
});

export const serializeGroups = (state: MultiGroupState): string =>
  JSON.stringify({
    joinedGroups: state.joinOrder,
    activeGroupId: state.activeGroupId,
  });

export const deserializeGroups = (json: string): PersistedGroupData => {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const joinedGroups = Array.isArray(parsed.joinedGroups)
      ? (parsed.joinedGroups as string[])
      : [];
    const activeGroupId =
      typeof parsed.activeGroupId === "string" ? parsed.activeGroupId : null;
    return { joinedGroups, activeGroupId };
  } catch {
    return createDefaultPersistedData();
  }
};

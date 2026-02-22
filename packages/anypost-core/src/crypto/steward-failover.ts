import type { AccountPublicKey } from "../shared/schemas.js";

export const STEWARD_HEARTBEAT_TIMEOUT_MS = 60_000;

type StewardFailoverState = {
  readonly currentSteward: AccountPublicKey;
  readonly lastHeartbeat: number;
  readonly onlineMembers: readonly AccountPublicKey[];
};

export const createStewardFailoverState = (
  currentSteward: AccountPublicKey,
  now: number,
): StewardFailoverState => ({
  currentSteward,
  lastHeartbeat: now,
  onlineMembers: [],
});

export const recordStewardHeartbeat = (
  state: StewardFailoverState,
  now: number,
): StewardFailoverState => ({
  ...state,
  lastHeartbeat: now,
});

export const isStewardOffline = (
  state: StewardFailoverState,
  now: number,
): boolean => now - state.lastHeartbeat > STEWARD_HEARTBEAT_TIMEOUT_MS;

export const electNewSteward = (
  candidates: readonly AccountPublicKey[],
): AccountPublicKey => {
  if (candidates.length === 0) {
    throw new Error("No candidates for steward election");
  }
  return [...candidates].sort()[0];
};

export const updateOnlineMembers = (
  state: StewardFailoverState,
  members: readonly AccountPublicKey[],
): StewardFailoverState => ({
  ...state,
  onlineMembers: members,
});

export const getCurrentSteward = (
  state: StewardFailoverState,
): AccountPublicKey => state.currentSteward;

export const getOnlineMembers = (
  state: StewardFailoverState,
): readonly AccountPublicKey[] => state.onlineMembers;

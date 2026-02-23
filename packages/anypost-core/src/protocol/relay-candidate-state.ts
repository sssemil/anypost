export type RelayCandidateEntry = {
  readonly peerId: string;
  readonly addresses: readonly string[];
  readonly rttMs: number | null;
  readonly discoveredAt: number;
  readonly hasReservation: boolean;
};

export type RelayCandidateState = {
  readonly candidates: ReadonlyMap<string, RelayCandidateEntry>;
  readonly maxCandidates: number;
};

export const DEFAULT_MAX_CANDIDATES = 20;

type CreateRelayCandidateStateOptions = {
  readonly maxCandidates?: number;
};

export const createRelayCandidateState = (
  options: CreateRelayCandidateStateOptions = {},
): RelayCandidateState => ({
  candidates: new Map(),
  maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
});

const findEvictionTarget = (
  candidates: ReadonlyMap<string, RelayCandidateEntry>,
): string | null => {
  let oldest: RelayCandidateEntry | null = null;
  for (const entry of candidates.values()) {
    if (entry.hasReservation) continue;
    if (!oldest || entry.discoveredAt < oldest.discoveredAt) {
      oldest = entry;
    }
  }
  return oldest?.peerId ?? null;
};

export const addCandidate = (
  state: RelayCandidateState,
  peerId: string,
  addresses: readonly string[],
  now: number,
): RelayCandidateState => {
  const existing = state.candidates.get(peerId);
  const entry: RelayCandidateEntry = {
    peerId,
    addresses,
    rttMs: existing?.rttMs ?? null,
    discoveredAt: existing?.discoveredAt ?? now,
    hasReservation: existing?.hasReservation ?? false,
  };

  const next = new Map(state.candidates);
  next.set(peerId, entry);

  if (next.size > state.maxCandidates) {
    const evictId = findEvictionTarget(next);
    if (evictId) next.delete(evictId);
  }

  return { ...state, candidates: next };
};

export const removeCandidate = (
  state: RelayCandidateState,
  peerId: string,
): RelayCandidateState => {
  if (!state.candidates.has(peerId)) return state;

  const next = new Map(state.candidates);
  next.delete(peerId);
  return { ...state, candidates: next };
};

const updateEntry = (
  state: RelayCandidateState,
  peerId: string,
  updater: (entry: RelayCandidateEntry) => RelayCandidateEntry,
): RelayCandidateState => {
  const existing = state.candidates.get(peerId);
  if (!existing) return state;

  const next = new Map(state.candidates);
  next.set(peerId, updater(existing));
  return { ...state, candidates: next };
};

export const updateRtt = (
  state: RelayCandidateState,
  peerId: string,
  rttMs: number,
): RelayCandidateState =>
  updateEntry(state, peerId, (entry) => ({ ...entry, rttMs }));

export const markReservationActive = (
  state: RelayCandidateState,
  peerId: string,
): RelayCandidateState =>
  updateEntry(state, peerId, (entry) => ({ ...entry, hasReservation: true }));

export const markReservationLost = (
  state: RelayCandidateState,
  peerId: string,
): RelayCandidateState =>
  updateEntry(state, peerId, (entry) => ({ ...entry, hasReservation: false }));

export const getReservedCount = (state: RelayCandidateState): number => {
  let count = 0;
  for (const entry of state.candidates.values()) {
    if (entry.hasReservation) count++;
  }
  return count;
};

export const getCandidatesByRtt = (
  state: RelayCandidateState,
): readonly RelayCandidateEntry[] =>
  [...state.candidates.values()].sort((a, b) => {
    if (a.rttMs === null && b.rttMs === null) return 0;
    if (a.rttMs === null) return 1;
    if (b.rttMs === null) return -1;
    return a.rttMs - b.rttMs;
  });

export const getCandidateAddresses = (
  state: RelayCandidateState,
): readonly string[] =>
  [...state.candidates.values()].flatMap((entry) => [...entry.addresses]);

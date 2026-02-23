export type DiscoveredPeer = {
  readonly peerId: string;
  readonly addrs: readonly string[];
  readonly discoveredAt: number;
};

export type GroupDiscoveryEntry = {
  readonly groupId: string;
  readonly isAdvertising: boolean;
  readonly isSearching: boolean;
  readonly peers: readonly DiscoveredPeer[];
  readonly lastSearchAt: number | null;
  readonly searchCount: number;
};

export type GroupDiscoveryState = {
  readonly groups: ReadonlyMap<string, GroupDiscoveryEntry>;
  readonly searchIntervalMs: number;
  readonly peerTtlMs: number;
};

const DEFAULT_SEARCH_INTERVAL_MS = 15_000;
const DEFAULT_PEER_TTL_MS = 300_000;

type CreateGroupDiscoveryStateOptions = {
  readonly searchIntervalMs?: number;
  readonly peerTtlMs?: number;
};

export const createGroupDiscoveryState = (
  options: CreateGroupDiscoveryStateOptions = {},
): GroupDiscoveryState => ({
  groups: new Map(),
  searchIntervalMs: options.searchIntervalMs ?? DEFAULT_SEARCH_INTERVAL_MS,
  peerTtlMs: options.peerTtlMs ?? DEFAULT_PEER_TTL_MS,
});

const createGroupEntry = (groupId: string): GroupDiscoveryEntry => ({
  groupId,
  isAdvertising: false,
  isSearching: false,
  peers: [],
  lastSearchAt: null,
  searchCount: 0,
});

const updateGroupEntry = (
  state: GroupDiscoveryState,
  groupId: string,
  updater: (entry: GroupDiscoveryEntry) => GroupDiscoveryEntry,
): GroupDiscoveryState => {
  const entry = state.groups.get(groupId);
  if (!entry) return state;

  const updated = new Map(state.groups);
  updated.set(groupId, updater(entry));
  return { ...state, groups: updated };
};

export const addGroup = (
  state: GroupDiscoveryState,
  groupId: string,
): GroupDiscoveryState => {
  if (state.groups.has(groupId)) return state;

  const updated = new Map(state.groups);
  updated.set(groupId, createGroupEntry(groupId));
  return { ...state, groups: updated };
};

export const removeGroup = (
  state: GroupDiscoveryState,
  groupId: string,
): GroupDiscoveryState => {
  if (!state.groups.has(groupId)) return state;

  const updated = new Map(state.groups);
  updated.delete(groupId);
  return { ...state, groups: updated };
};

export const markSearchStarted = (
  state: GroupDiscoveryState,
  groupId: string,
): GroupDiscoveryState =>
  updateGroupEntry(state, groupId, (entry) => ({
    ...entry,
    isSearching: true,
  }));

export const markSearchCompleted = (
  state: GroupDiscoveryState,
  groupId: string,
  now: number,
): GroupDiscoveryState =>
  updateGroupEntry(state, groupId, (entry) => ({
    ...entry,
    isSearching: false,
    lastSearchAt: now,
    searchCount: entry.searchCount + 1,
  }));

export const markAdvertising = (
  state: GroupDiscoveryState,
  groupId: string,
): GroupDiscoveryState =>
  updateGroupEntry(state, groupId, (entry) => ({
    ...entry,
    isAdvertising: true,
  }));

export const addDiscoveredPeer = (
  state: GroupDiscoveryState,
  groupId: string,
  peer: DiscoveredPeer,
): GroupDiscoveryState =>
  updateGroupEntry(state, groupId, (entry) => ({
    ...entry,
    peers: [
      ...entry.peers.filter((p) => p.peerId !== peer.peerId),
      peer,
    ],
  }));

export const pruneExpiredPeers = (
  state: GroupDiscoveryState,
  now: number,
): GroupDiscoveryState => {
  let changed = false;
  const updated = new Map<string, GroupDiscoveryEntry>();

  for (const [groupId, entry] of state.groups) {
    const filtered = entry.peers.filter(
      (p) => now - p.discoveredAt < state.peerTtlMs,
    );
    if (filtered.length !== entry.peers.length) {
      changed = true;
      updated.set(groupId, { ...entry, peers: filtered });
    } else {
      updated.set(groupId, entry);
    }
  }

  return changed ? { ...state, groups: updated } : state;
};

export const getNewPeers = (
  state: GroupDiscoveryState,
  groupId: string,
  connectedPeerIds: ReadonlySet<string>,
): readonly DiscoveredPeer[] => {
  const entry = state.groups.get(groupId);
  if (!entry) return [];
  return entry.peers.filter((p) => !connectedPeerIds.has(p.peerId));
};

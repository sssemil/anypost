import type { CID } from "multiformats/cid";
import { createProviderCid, createGroupProviderNamespace } from "./dht-config.js";
import {
  type GroupDiscoveryState,
  createGroupDiscoveryState,
  addGroup,
  removeGroup,
  markSearchStarted,
  markSearchCompleted,
  markAdvertising,
  addDiscoveredPeer,
  getNewPeers,
  pruneExpiredPeers,
} from "./group-discovery-state.js";

type PeerInfo = {
  readonly id: { toString(): string };
  readonly multiaddrs: ReadonlyArray<{ toString(): string }>;
};

type GroupDiscoveryManagerDeps = {
  readonly contentRouting: {
    provide(cid: CID): Promise<void>;
    findProviders(cid: CID): AsyncIterable<PeerInfo>;
  };
  readonly getConnectedPeerIds: () => readonly string[];
  readonly onStateChange: (state: GroupDiscoveryState) => void;
  readonly onPeerDiscovered: (groupId: string, peerId: string, addrs: readonly string[]) => void;
  readonly searchIntervalMs?: number;
  readonly searchScheduleMs?: readonly number[];
  readonly onSearchCompleted?: (groupId: string, searchRound: number, providersFound: number) => void;
};

export type GroupDiscoveryManager = {
  readonly joinGroup: (groupId: string) => void;
  readonly leaveGroup: (groupId: string) => void;
  readonly stop: () => void;
};

const DEFAULT_SEARCH_INTERVAL_MS = 15_000;
const DEFAULT_SEARCH_SCHEDULE_MS = [0, 1_500, 4_000, 9_000] as const;

const normalizeAddresses = (addrs: readonly string[]): readonly string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const raw of addrs) {
    const addr = raw.trim();
    if (addr.length === 0 || seen.has(addr)) continue;
    seen.add(addr);
    deduped.push(addr);
  }
  return deduped;
};

export const createGroupDiscoveryManager = (
  deps: GroupDiscoveryManagerDeps,
): GroupDiscoveryManager => {
  const searchIntervalMs = deps.searchIntervalMs ?? DEFAULT_SEARCH_INTERVAL_MS;
  const searchScheduleMs = deps.searchScheduleMs ?? DEFAULT_SEARCH_SCHEDULE_MS;
  let state = createGroupDiscoveryState({ searchIntervalMs });
  let stopped = false;

  const groupIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const groupBursts = new Map<string, ReturnType<typeof setTimeout>[]>();
  const searchInFlight = new Set<string>();

  const updateState = (newState: GroupDiscoveryState) => {
    state = newState;
    deps.onStateChange(state);
  };

  const runSearch = async (groupId: string) => {
    if (stopped || !state.groups.has(groupId)) return;
    if (searchInFlight.has(groupId)) return;

    searchInFlight.add(groupId);

    const namespace = createGroupProviderNamespace(groupId);
    const cid = await createProviderCid(namespace);

    updateState(markSearchStarted(state, groupId));
    let providersFound = 0;

    try {
      for await (const provider of deps.contentRouting.findProviders(cid)) {
        if (stopped || !state.groups.has(groupId)) return;

        const peerId = provider.id.toString();
        const addrs = normalizeAddresses(provider.multiaddrs.map((ma) => ma.toString()));
        providersFound++;

        updateState(
          addDiscoveredPeer(state, groupId, {
            peerId,
            addrs,
            discoveredAt: Date.now(),
          }),
        );
      }
    } catch {
      // findProviders failure is non-fatal
    } finally {
      if (state.groups.has(groupId)) {
        updateState(markSearchCompleted(state, groupId, Date.now()));
        updateState(pruneExpiredPeers(state, Date.now()));
        const searchRound = state.groups.get(groupId)?.searchCount ?? 0;
        deps.onSearchCompleted?.(groupId, searchRound, providersFound);
      }
      searchInFlight.delete(groupId);
    }

    const connectedSet = new Set(deps.getConnectedPeerIds());
    const newPeers = getNewPeers(state, groupId, connectedSet);
    for (const peer of newPeers) {
      deps.onPeerDiscovered(groupId, peer.peerId, peer.addrs);
    }
  };

  return {
    joinGroup: (groupId: string) => {
      if (state.groups.has(groupId)) return;

      updateState(addGroup(state, groupId));

      const namespace = createGroupProviderNamespace(groupId);
      createProviderCid(namespace).then((cid) => {
        if (stopped || !state.groups.has(groupId)) return;
        deps.contentRouting.provide(cid).then(() => {
          if (state.groups.has(groupId)) {
            updateState(markAdvertising(state, groupId));
          }
        }).catch(() => {});
      }).catch(() => {});

      const interval = setInterval(() => void runSearch(groupId), searchIntervalMs);
      groupIntervals.set(groupId, interval);

      const burstTimers = searchScheduleMs.map((delayMs) =>
        setTimeout(() => {
          void runSearch(groupId);
        }, delayMs),
      );
      groupBursts.set(groupId, burstTimers);
    },
    leaveGroup: (groupId: string) => {
      const interval = groupIntervals.get(groupId);
      if (interval) {
        clearInterval(interval);
        groupIntervals.delete(groupId);
      }
      const bursts = groupBursts.get(groupId);
      if (bursts) {
        for (const timer of bursts) clearTimeout(timer);
        groupBursts.delete(groupId);
      }
      searchInFlight.delete(groupId);
      updateState(removeGroup(state, groupId));
    },
    stop: () => {
      stopped = true;
      for (const interval of groupIntervals.values()) {
        clearInterval(interval);
      }
      for (const bursts of groupBursts.values()) {
        for (const timer of bursts) clearTimeout(timer);
      }
      groupIntervals.clear();
      groupBursts.clear();
      searchInFlight.clear();
    },
  };
};

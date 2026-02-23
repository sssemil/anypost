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
};

export type GroupDiscoveryManager = {
  readonly joinGroup: (groupId: string) => void;
  readonly leaveGroup: (groupId: string) => void;
  readonly stop: () => void;
};

const DEFAULT_SEARCH_INTERVAL_MS = 15_000;

export const createGroupDiscoveryManager = (
  deps: GroupDiscoveryManagerDeps,
): GroupDiscoveryManager => {
  const searchIntervalMs = deps.searchIntervalMs ?? DEFAULT_SEARCH_INTERVAL_MS;
  let state = createGroupDiscoveryState({ searchIntervalMs });
  let stopped = false;

  const groupIntervals = new Map<string, ReturnType<typeof setInterval>>();

  const updateState = (newState: GroupDiscoveryState) => {
    state = newState;
    deps.onStateChange(state);
  };

  const runSearch = async (groupId: string) => {
    if (stopped || !state.groups.has(groupId)) return;

    const namespace = createGroupProviderNamespace(groupId);
    const cid = await createProviderCid(namespace);

    updateState(markSearchStarted(state, groupId));

    try {
      for await (const provider of deps.contentRouting.findProviders(cid)) {
        if (stopped || !state.groups.has(groupId)) return;

        const peerId = provider.id.toString();
        const addrs = provider.multiaddrs.map((ma) => ma.toString());

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
      }
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

      void runSearch(groupId);
    },
    leaveGroup: (groupId: string) => {
      const interval = groupIntervals.get(groupId);
      if (interval) {
        clearInterval(interval);
        groupIntervals.delete(groupId);
      }
      updateState(removeGroup(state, groupId));
    },
    stop: () => {
      stopped = true;
      for (const interval of groupIntervals.values()) {
        clearInterval(interval);
      }
      groupIntervals.clear();
    },
  };
};

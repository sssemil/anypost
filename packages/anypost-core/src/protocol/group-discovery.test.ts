import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGroupDiscoveryManager } from "./group-discovery.js";
import type { GroupDiscoveryState } from "./group-discovery-state.js";
import type { CID } from "multiformats/cid";

type PeerInfo = {
  readonly id: { toString(): string };
  readonly multiaddrs: ReadonlyArray<{ toString(): string }>;
};

const createFakeContentRouting = () => {
  const providedCids: CID[] = [];
  let findProvidersResults: PeerInfo[] = [];

  return {
    routing: {
      provide: async (cid: CID) => {
        providedCids.push(cid);
      },
      findProviders: async function* (
        _cid: CID,
      ): AsyncIterable<PeerInfo> {
        for (const peer of findProvidersResults) {
          yield peer;
        }
      },
    },
    getProvidedCids: () => providedCids,
    setFindProvidersResults: (results: PeerInfo[]) => {
      findProvidersResults = results;
    },
  };
};

describe("createGroupDiscoveryManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call provide when joining a group", async () => {
    const fake = createFakeContentRouting();
    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: () => {},
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.getProvidedCids()).toHaveLength(1);

    manager.stop();
  });

  it("should discover peers via findProviders polling", async () => {
    const fake = createFakeContentRouting();
    const discoveredPeers: Array<{ groupId: string; peerId: string }> = [];

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-1" },
        multiaddrs: [{ toString: () => "/ip4/1.2.3.4/tcp/4001" }],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: (groupId, peerId) => {
        discoveredPeers.push({ groupId, peerId });
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(discoveredPeers).toContainEqual({
      groupId: "group-1",
      peerId: "peer-1",
    });

    manager.stop();
  });

  it("should filter out already-connected peers", async () => {
    const fake = createFakeContentRouting();
    const discoveredPeers: string[] = [];

    fake.setFindProvidersResults([
      {
        id: { toString: () => "connected-peer" },
        multiaddrs: [{ toString: () => "/ip4/1.2.3.4" }],
      },
      {
        id: { toString: () => "new-peer" },
        multiaddrs: [{ toString: () => "/ip4/5.6.7.8" }],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => ["connected-peer"],
      onStateChange: () => {},
      onPeerDiscovered: (_groupId, peerId) => {
        discoveredPeers.push(peerId);
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(discoveredPeers).toContain("new-peer");
    expect(discoveredPeers).not.toContain("connected-peer");

    manager.stop();
  });

  it("should stop polling when a group is left", async () => {
    const fake = createFakeContentRouting();
    const discoveredPeers: string[] = [];

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-1" },
        multiaddrs: [{ toString: () => "/ip4/1.2.3.4" }],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: (_groupId, peerId) => {
        discoveredPeers.push(peerId);
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    manager.leaveGroup("group-1");

    discoveredPeers.length = 0;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(discoveredPeers).toHaveLength(0);

    manager.stop();
  });

  it("should stop all polling on stop()", async () => {
    const fake = createFakeContentRouting();
    const discoveredPeers: string[] = [];

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-1" },
        multiaddrs: [{ toString: () => "/ip4/1.2.3.4" }],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: (_groupId, peerId) => {
        discoveredPeers.push(peerId);
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    manager.stop();

    discoveredPeers.length = 0;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(discoveredPeers).toHaveLength(0);
  });

  it("should emit state changes", async () => {
    const fake = createFakeContentRouting();
    const stateChanges: GroupDiscoveryState[] = [];

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: (state) => {
        stateChanges.push(state);
      },
      onPeerDiscovered: () => {},
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(stateChanges.length).toBeGreaterThan(0);
    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState.groups.has("group-1")).toBe(true);

    manager.stop();
  });

  it("should continue polling on interval", async () => {
    const fake = createFakeContentRouting();
    let discoverCount = 0;

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-1" },
        multiaddrs: [{ toString: () => "/ip4/1.2.3.4" }],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: () => {
        discoverCount++;
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    const initialCount = discoverCount;

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-2" },
        multiaddrs: [{ toString: () => "/ip4/9.10.11.12" }],
      },
    ]);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(discoverCount).toBeGreaterThan(initialCount);

    manager.stop();
  });

  it("should normalize and deduplicate discovered peer addresses", async () => {
    const fake = createFakeContentRouting();
    const discovered: Array<{ peerId: string; addrs: readonly string[] }> = [];

    fake.setFindProvidersResults([
      {
        id: { toString: () => "peer-1" },
        multiaddrs: [
          { toString: () => "  /ip4/1.2.3.4/tcp/4001/ws/p2p/peer-1  " },
          { toString: () => "/ip4/1.2.3.4/tcp/4001/ws/p2p/peer-1" },
          { toString: () => "" },
        ],
      },
    ]);

    const manager = createGroupDiscoveryManager({
      contentRouting: fake.routing,
      getConnectedPeerIds: () => [],
      onStateChange: () => {},
      onPeerDiscovered: (_groupId, peerId, addrs) => {
        discovered.push({ peerId, addrs });
      },
    });

    manager.joinGroup("group-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(discovered).toHaveLength(1);
    expect(discovered[0].peerId).toBe("peer-1");
    expect(discovered[0].addrs).toEqual(["/ip4/1.2.3.4/tcp/4001/ws/p2p/peer-1"]);

    manager.stop();
  });
});

import { describe, it, expect } from "vitest";
import {
  createGroupDiscoveryState,
  addGroup,
  removeGroup,
  markSearchStarted,
  markSearchCompleted,
  markAdvertising,
  addDiscoveredPeer,
  pruneExpiredPeers,
  getNewPeers,
} from "./group-discovery-state.js";

describe("createGroupDiscoveryState", () => {
  it("should create state with empty groups map", () => {
    const state = createGroupDiscoveryState();

    expect(state.groups.size).toBe(0);
  });

  it("should use default search interval of 15000ms", () => {
    const state = createGroupDiscoveryState();

    expect(state.searchIntervalMs).toBe(15_000);
  });

  it("should use default peer TTL of 300000ms", () => {
    const state = createGroupDiscoveryState();

    expect(state.peerTtlMs).toBe(300_000);
  });

  it("should accept custom options", () => {
    const state = createGroupDiscoveryState({
      searchIntervalMs: 30_000,
      peerTtlMs: 60_000,
    });

    expect(state.searchIntervalMs).toBe(30_000);
    expect(state.peerTtlMs).toBe(60_000);
  });
});

describe("addGroup", () => {
  it("should add a group entry to state", () => {
    const state = createGroupDiscoveryState();

    const next = addGroup(state, "group-1");

    expect(next.groups.size).toBe(1);
    expect(next.groups.get("group-1")).toEqual({
      groupId: "group-1",
      isAdvertising: false,
      isSearching: false,
      peers: [],
      lastSearchAt: null,
      searchCount: 0,
    });
  });

  it("should not modify state if group already exists", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");

    const next = addGroup(state, "group-1");

    expect(next).toBe(state);
  });

  it("should preserve existing groups when adding new one", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");

    const next = addGroup(state, "group-2");

    expect(next.groups.size).toBe(2);
    expect(next.groups.has("group-1")).toBe(true);
    expect(next.groups.has("group-2")).toBe(true);
  });
});

describe("removeGroup", () => {
  it("should remove a group from state", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");

    const next = removeGroup(state, "group-1");

    expect(next.groups.size).toBe(0);
  });

  it("should not modify state if group does not exist", () => {
    const state = createGroupDiscoveryState();

    const next = removeGroup(state, "group-1");

    expect(next).toBe(state);
  });
});

describe("markSearchStarted", () => {
  it("should mark a group as searching", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");

    const next = markSearchStarted(state, "group-1");

    expect(next.groups.get("group-1")!.isSearching).toBe(true);
  });

  it("should return same state if group does not exist", () => {
    const state = createGroupDiscoveryState();

    const next = markSearchStarted(state, "group-1");

    expect(next).toBe(state);
  });
});

describe("markSearchCompleted", () => {
  it("should mark a group as not searching and increment search count", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");
    state = markSearchStarted(state, "group-1");

    const now = 1000;
    const next = markSearchCompleted(state, "group-1", now);
    const entry = next.groups.get("group-1")!;

    expect(entry.isSearching).toBe(false);
    expect(entry.lastSearchAt).toBe(1000);
    expect(entry.searchCount).toBe(1);
  });

  it("should increment search count on each completion", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");

    state = markSearchStarted(state, "group-1");
    state = markSearchCompleted(state, "group-1", 1000);
    state = markSearchStarted(state, "group-1");
    state = markSearchCompleted(state, "group-1", 2000);

    expect(state.groups.get("group-1")!.searchCount).toBe(2);
  });
});

describe("markAdvertising", () => {
  it("should mark a group as advertising", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");

    const next = markAdvertising(state, "group-1");

    expect(next.groups.get("group-1")!.isAdvertising).toBe(true);
  });

  it("should return same state if group does not exist", () => {
    const state = createGroupDiscoveryState();

    const next = markAdvertising(state, "group-1");

    expect(next).toBe(state);
  });
});

describe("addDiscoveredPeer", () => {
  it("should add a peer to a group", () => {
    const state = addGroup(createGroupDiscoveryState(), "group-1");
    const peer = { peerId: "peer-1", addrs: ["/ip4/1.2.3.4"], discoveredAt: 1000 };

    const next = addDiscoveredPeer(state, "group-1", peer);

    expect(next.groups.get("group-1")!.peers).toEqual([peer]);
  });

  it("should deduplicate peers by peerId", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");
    const peer1 = { peerId: "peer-1", addrs: ["/ip4/1.2.3.4"], discoveredAt: 1000 };
    const peer1Updated = { peerId: "peer-1", addrs: ["/ip4/5.6.7.8"], discoveredAt: 2000 };

    state = addDiscoveredPeer(state, "group-1", peer1);
    state = addDiscoveredPeer(state, "group-1", peer1Updated);

    const peers = state.groups.get("group-1")!.peers;
    expect(peers).toHaveLength(1);
    expect(peers[0].addrs).toEqual(["/ip4/5.6.7.8"]);
    expect(peers[0].discoveredAt).toBe(2000);
  });

  it("should preserve existing peers when adding new one", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-1", addrs: [], discoveredAt: 1000,
    });

    const next = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-2", addrs: [], discoveredAt: 2000,
    });

    expect(next.groups.get("group-1")!.peers).toHaveLength(2);
  });

  it("should return same state if group does not exist", () => {
    const state = createGroupDiscoveryState();
    const peer = { peerId: "peer-1", addrs: [], discoveredAt: 1000 };

    const next = addDiscoveredPeer(state, "group-1", peer);

    expect(next).toBe(state);
  });
});

describe("pruneExpiredPeers", () => {
  it("should remove peers older than peerTtlMs", () => {
    let state = createGroupDiscoveryState({ peerTtlMs: 5000 });
    state = addGroup(state, "group-1");
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "old-peer", addrs: [], discoveredAt: 1000,
    });
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "new-peer", addrs: [], discoveredAt: 5000,
    });

    const pruned = pruneExpiredPeers(state, 6500);

    const peers = pruned.groups.get("group-1")!.peers;
    expect(peers).toHaveLength(1);
    expect(peers[0].peerId).toBe("new-peer");
  });

  it("should keep all peers if none are expired", () => {
    let state = createGroupDiscoveryState({ peerTtlMs: 5000 });
    state = addGroup(state, "group-1");
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-1", addrs: [], discoveredAt: 1000,
    });

    const pruned = pruneExpiredPeers(state, 3000);

    expect(pruned.groups.get("group-1")!.peers).toHaveLength(1);
  });

  it("should return same state if no groups have peers to prune", () => {
    const state = createGroupDiscoveryState();

    const pruned = pruneExpiredPeers(state, 10000);

    expect(pruned).toBe(state);
  });
});

describe("getNewPeers", () => {
  it("should return peers not in the connected set", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-1", addrs: ["/ip4/1.2.3.4"], discoveredAt: 1000,
    });
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-2", addrs: ["/ip4/5.6.7.8"], discoveredAt: 2000,
    });

    const newPeers = getNewPeers(state, "group-1", new Set(["peer-1"]));

    expect(newPeers).toHaveLength(1);
    expect(newPeers[0].peerId).toBe("peer-2");
  });

  it("should return empty array when all peers are connected", () => {
    let state = addGroup(createGroupDiscoveryState(), "group-1");
    state = addDiscoveredPeer(state, "group-1", {
      peerId: "peer-1", addrs: [], discoveredAt: 1000,
    });

    const newPeers = getNewPeers(state, "group-1", new Set(["peer-1"]));

    expect(newPeers).toHaveLength(0);
  });

  it("should return empty array for unknown group", () => {
    const state = createGroupDiscoveryState();

    const newPeers = getNewPeers(state, "unknown", new Set());

    expect(newPeers).toHaveLength(0);
  });
});

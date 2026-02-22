import { describe, it, expect } from "vitest";
import {
  createRelayPoolState,
  addRelay,
  removeRelay,
  needsMoreRelays,
  markDiscoveryStarted,
  markDiscoveryCompleted,
  getActiveRelayCount,
  selectBestRelays,
} from "./relay-pool.js";
import {
  recordHealthCheckSuccess,
  recordHealthCheckFailure,
} from "./relay-health.js";

const RELAY_A = "/ip4/1.2.3.4/tcp/4001/ws";
const RELAY_B = "/ip4/5.6.7.8/tcp/4001/ws";
const RELAY_C = "/ip4/9.10.11.12/tcp/4001/ws";

describe("createRelayPoolState", () => {
  it("should create an empty pool by default", () => {
    const state = createRelayPoolState();

    expect(state.relays).toEqual([]);
    expect(state.discoveryInProgress).toBe(false);
  });

  it("should accept a custom target pool size", () => {
    const state = createRelayPoolState({ targetPoolSize: 6 });

    expect(state.targetPoolSize).toBe(6);
  });

  it("should default to target pool size of 4", () => {
    const state = createRelayPoolState();

    expect(state.targetPoolSize).toBe(4);
  });

  it("should accept initial relay addresses", () => {
    const state = createRelayPoolState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    expect(state.relays).toHaveLength(2);
    expect(state.relays[0].address).toBe(RELAY_A);
    expect(state.relays[1].address).toBe(RELAY_B);
  });
});

describe("addRelay", () => {
  it("should add a new relay with unknown status", () => {
    const state = createRelayPoolState();
    const updated = addRelay(state, RELAY_A);

    expect(updated.relays).toHaveLength(1);
    expect(updated.relays[0].address).toBe(RELAY_A);
    expect(updated.relays[0].status).toBe("unknown");
  });

  it("should be idempotent — adding the same relay twice does not duplicate", () => {
    const state = createRelayPoolState();
    const once = addRelay(state, RELAY_A);
    const twice = addRelay(once, RELAY_A);

    expect(twice.relays).toHaveLength(1);
  });

  it("should not mutate original state", () => {
    const original = createRelayPoolState();
    addRelay(original, RELAY_A);

    expect(original.relays).toHaveLength(0);
  });
});

describe("removeRelay", () => {
  it("should remove a relay from the pool", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    const updated = removeRelay(state, RELAY_A);

    expect(updated.relays).toHaveLength(1);
    expect(updated.relays[0].address).toBe(RELAY_B);
  });

  it("should return unchanged state when removing a non-existent relay", () => {
    const state = createRelayPoolState();
    const updated = removeRelay(state, RELAY_A);

    expect(updated).toBe(state);
  });

  it("should not mutate original state", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);
    removeRelay(state, RELAY_A);

    expect(state.relays).toHaveLength(1);
  });
});

describe("needsMoreRelays", () => {
  it("should return true when pool is empty", () => {
    const state = createRelayPoolState({ targetPoolSize: 4 });

    expect(needsMoreRelays(state)).toBe(true);
  });

  it("should return true when below target pool size", () => {
    let state = createRelayPoolState({ targetPoolSize: 4 });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);

    expect(needsMoreRelays(state)).toBe(true);
  });

  it("should return false when at target pool size", () => {
    let state = createRelayPoolState({ targetPoolSize: 2 });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);

    expect(needsMoreRelays(state)).toBe(false);
  });

  it("should count only healthy, degraded, and unknown relays toward pool size", () => {
    let state = createRelayPoolState({
      targetPoolSize: 2,
      failureThreshold: 1,
    });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(needsMoreRelays(state)).toBe(true);
  });
});

describe("markDiscoveryStarted / markDiscoveryCompleted", () => {
  it("should mark discovery as in progress", () => {
    const state = createRelayPoolState();
    const updated = markDiscoveryStarted(state);

    expect(updated.discoveryInProgress).toBe(true);
  });

  it("should mark discovery as completed", () => {
    let state = createRelayPoolState();
    state = markDiscoveryStarted(state);
    const updated = markDiscoveryCompleted(state);

    expect(updated.discoveryInProgress).toBe(false);
  });

  it("should not mutate original state", () => {
    const original = createRelayPoolState();
    markDiscoveryStarted(original);

    expect(original.discoveryInProgress).toBe(false);
  });
});

describe("getActiveRelayCount", () => {
  it("should return zero for empty pool", () => {
    const state = createRelayPoolState();

    expect(getActiveRelayCount(state)).toBe(0);
  });

  it("should count healthy and degraded relays as active", () => {
    let state = createRelayPoolState({ failureThreshold: 3 });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    state = addRelay(state, RELAY_C);
    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckFailure(state, RELAY_B);

    expect(getActiveRelayCount(state)).toBe(2);
  });

  it("should not count unhealthy or unknown relays", () => {
    let state = createRelayPoolState({ failureThreshold: 1 });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getActiveRelayCount(state)).toBe(0);
  });
});

describe("selectBestRelays", () => {
  it("should select N relays sorted by lowest latency", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    state = addRelay(state, RELAY_C);
    state = recordHealthCheckSuccess(state, RELAY_A, 100);
    state = recordHealthCheckSuccess(state, RELAY_B, 30);
    state = recordHealthCheckSuccess(state, RELAY_C, 60);

    const best = selectBestRelays(state, 2);

    expect(best).toEqual([RELAY_B, RELAY_C]);
  });

  it("should return fewer than requested when pool is smaller", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_A, 50);

    const best = selectBestRelays(state, 3);

    expect(best).toEqual([RELAY_A]);
  });

  it("should skip unhealthy relays", () => {
    let state = createRelayPoolState({ failureThreshold: 1 });
    state = addRelay(state, RELAY_A);
    state = addRelay(state, RELAY_B);
    state = recordHealthCheckSuccess(state, RELAY_A, 30);
    state = recordHealthCheckFailure(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_B, 100);

    const best = selectBestRelays(state, 2);

    expect(best).toEqual([RELAY_B]);
  });

  it("should include degraded relays with latency", () => {
    let state = createRelayPoolState({ failureThreshold: 3 });
    state = addRelay(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckFailure(state, RELAY_A);

    const best = selectBestRelays(state, 2);

    expect(best).toEqual([RELAY_A]);
  });

  it("should return empty array when no relays have latency", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);

    const best = selectBestRelays(state, 2);

    expect(best).toEqual([]);
  });
});

describe("relay-health compatibility", () => {
  it("should work with recordHealthCheckSuccess from relay-health", () => {
    let state = createRelayPoolState();
    state = addRelay(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_A, 42);

    expect(state.relays[0].status).toBe("healthy");
    expect(state.relays[0].latencyMs).toBe(42);
  });

  it("should work with recordHealthCheckFailure from relay-health", () => {
    let state = createRelayPoolState({ failureThreshold: 1 });
    state = addRelay(state, RELAY_A);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(state.relays[0].status).toBe("unhealthy");
  });
});

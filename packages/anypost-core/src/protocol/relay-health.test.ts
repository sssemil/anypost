import { describe, it, expect } from "vitest";
import {
  createRelayHealthState,
  recordHealthCheckSuccess,
  recordHealthCheckFailure,
  selectBestRelay,
  getRelayStatus,
  getHealthyRelayCount,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_FAILURE_THRESHOLD,
} from "./relay-health.js";

const RELAY_A = "/ip4/1.2.3.4/tcp/4001/ws";
const RELAY_B = "/ip4/5.6.7.8/tcp/4001/ws";
const RELAY_C = "/ip4/9.10.11.12/tcp/4001/ws";

describe("createRelayHealthState", () => {
  it("should initialize all relays as unknown", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    expect(getRelayStatus(state, RELAY_A)).toBe("unknown");
    expect(getRelayStatus(state, RELAY_B)).toBe("unknown");
  });

  it("should require at least one relay address", () => {
    expect(() => createRelayHealthState({ relayAddresses: [] })).toThrow(
      RangeError,
    );
  });

  it("should reject duplicate relay addresses", () => {
    expect(() =>
      createRelayHealthState({ relayAddresses: [RELAY_A, RELAY_A] }),
    ).toThrow(RangeError);
  });
});

describe("recordHealthCheckSuccess", () => {
  it("should mark relay as healthy", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    const updated = recordHealthCheckSuccess(state, RELAY_A, 50);

    expect(getRelayStatus(updated, RELAY_A)).toBe("healthy");
  });

  it("should record latency and use it for relay selection ordering", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 42);
    state = recordHealthCheckSuccess(state, RELAY_B, 100);

    expect(selectBestRelay(state)).toBe(RELAY_A);
  });

  it("should reject non-positive latencyMs", () => {
    const state = createRelayHealthState({ relayAddresses: [RELAY_A] });

    expect(() => recordHealthCheckSuccess(state, RELAY_A, 0)).toThrow(RangeError);
    expect(() => recordHealthCheckSuccess(state, RELAY_A, -1)).toThrow(RangeError);
  });

  it("should reject non-finite latencyMs", () => {
    const state = createRelayHealthState({ relayAddresses: [RELAY_A] });

    expect(() => recordHealthCheckSuccess(state, RELAY_A, NaN)).toThrow(RangeError);
    expect(() => recordHealthCheckSuccess(state, RELAY_A, Infinity)).toThrow(RangeError);
  });

  it("should recover a previously unhealthy relay", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 1,
    });
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(state, RELAY_A)).toBe("unhealthy");

    state = recordHealthCheckSuccess(state, RELAY_A, 50);

    expect(getRelayStatus(state, RELAY_A)).toBe("healthy");
  });

  it("should reset failure count so relay can tolerate failures again after recovery", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 2,
    });

    state = recordHealthCheckFailure(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(state, RELAY_A)).toBe("degraded");
  });

  it("should reject unknown relay address", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A],
    });

    expect(() =>
      recordHealthCheckSuccess(state, "/unknown/relay", 50),
    ).toThrow(Error);
  });

  it("should not mutate original state", () => {
    const original = createRelayHealthState({
      relayAddresses: [RELAY_A],
    });
    recordHealthCheckSuccess(original, RELAY_A, 50);

    expect(getRelayStatus(original, RELAY_A)).toBe("unknown");
  });
});

describe("recordHealthCheckFailure", () => {
  it("should not immediately mark relay as unhealthy with default threshold", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A],
    });

    const updated = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(updated, RELAY_A)).toBe("degraded");
  });

  it("should mark relay as unhealthy after reaching failure threshold", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 3,
    });

    state = recordHealthCheckFailure(state, RELAY_A);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(state, RELAY_A)).toBe("degraded");

    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(state, RELAY_A)).toBe("unhealthy");
  });

  it("should mark unhealthy with threshold of 1", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 1,
    });

    state = recordHealthCheckFailure(state, RELAY_A);

    expect(getRelayStatus(state, RELAY_A)).toBe("unhealthy");
  });

  it("should reject unknown relay address", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A],
    });

    expect(() => recordHealthCheckFailure(state, "/unknown/relay")).toThrow(
      Error,
    );
  });

  it("should not mutate original state", () => {
    const original = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 1,
    });
    recordHealthCheckFailure(original, RELAY_A);

    expect(getRelayStatus(original, RELAY_A)).toBe("unknown");
  });
});

describe("selectBestRelay", () => {
  it("should select the lowest-latency healthy relay", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B, RELAY_C],
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 100);
    state = recordHealthCheckSuccess(state, RELAY_B, 30);
    state = recordHealthCheckSuccess(state, RELAY_C, 60);

    expect(selectBestRelay(state)).toBe(RELAY_B);
  });

  it("should skip unhealthy relays", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
      failureThreshold: 1,
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 30);
    state = recordHealthCheckFailure(state, RELAY_A);
    state = recordHealthCheckSuccess(state, RELAY_B, 100);

    expect(selectBestRelay(state)).toBe(RELAY_B);
  });

  it("should return null when all relays are unhealthy", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A],
      failureThreshold: 1,
    });

    state = recordHealthCheckFailure(state, RELAY_A);

    expect(selectBestRelay(state)).toBe(null);
  });

  it("should prefer degraded relay with latency over unknown relay", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
      failureThreshold: 3,
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckFailure(state, RELAY_A);

    expect(selectBestRelay(state)).toBe(RELAY_A);
  });

  it("should fall back to lowest-latency degraded relay when no healthy relays exist", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
      failureThreshold: 3,
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckSuccess(state, RELAY_B, 30);
    state = recordHealthCheckFailure(state, RELAY_A);
    state = recordHealthCheckFailure(state, RELAY_B);

    expect(selectBestRelay(state)).toBe(RELAY_B);
  });

  it("should prefer healthy relay over unknown relay", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    state = recordHealthCheckSuccess(state, RELAY_B, 100);

    expect(selectBestRelay(state)).toBe(RELAY_B);
  });

  it("should return first unknown relay when no healthy relays exist but unknowns remain", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    expect(selectBestRelay(state)).toBe(RELAY_A);
  });
});

describe("getHealthyRelayCount", () => {
  it("should return zero initially", () => {
    const state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B],
    });

    expect(getHealthyRelayCount(state)).toBe(0);
  });

  it("should count healthy relays", () => {
    let state = createRelayHealthState({
      relayAddresses: [RELAY_A, RELAY_B, RELAY_C],
    });

    state = recordHealthCheckSuccess(state, RELAY_A, 50);
    state = recordHealthCheckSuccess(state, RELAY_C, 70);

    expect(getHealthyRelayCount(state)).toBe(2);
  });
});

describe("input validation", () => {
  it("should reject non-positive failureThreshold", () => {
    expect(() =>
      createRelayHealthState({
        relayAddresses: [RELAY_A],
        failureThreshold: 0,
      }),
    ).toThrow(RangeError);
  });

  it("should reject non-integer failureThreshold", () => {
    expect(() =>
      createRelayHealthState({
        relayAddresses: [RELAY_A],
        failureThreshold: 1.5,
      }),
    ).toThrow(RangeError);
  });

  it("should reject non-positive healthCheckIntervalMs", () => {
    expect(() =>
      createRelayHealthState({
        relayAddresses: [RELAY_A],
        healthCheckIntervalMs: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("defaults", () => {
  it("should have 30000ms health check interval", () => {
    expect(DEFAULT_HEALTH_CHECK_INTERVAL_MS).toBe(30_000);
  });

  it("should have failure threshold of 3", () => {
    expect(DEFAULT_FAILURE_THRESHOLD).toBe(3);
  });
});

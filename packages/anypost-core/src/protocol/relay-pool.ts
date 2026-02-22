import {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  type RelayEntry,
  type RelayWithLatency,
} from "./relay-health.js";
import { DEFAULT_TARGET_RELAY_POOL_SIZE } from "./dht-config.js";

export type RelayPoolState = {
  readonly relays: readonly RelayEntry[];
  readonly failureThreshold: number;
  readonly healthCheckIntervalMs: number;
  readonly targetPoolSize: number;
  readonly discoveryInProgress: boolean;
};

type CreateRelayPoolStateOptions = {
  readonly relayAddresses?: readonly string[];
  readonly failureThreshold?: number;
  readonly healthCheckIntervalMs?: number;
  readonly targetPoolSize?: number;
};

export const createRelayPoolState = (
  options: CreateRelayPoolStateOptions = {},
): RelayPoolState => {
  const {
    relayAddresses = [],
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    healthCheckIntervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS,
    targetPoolSize = DEFAULT_TARGET_RELAY_POOL_SIZE,
  } = options;

  return {
    relays: relayAddresses.map((address) => ({
      address,
      status: "unknown" as const,
      consecutiveFailures: 0,
      latencyMs: null,
    })),
    failureThreshold,
    healthCheckIntervalMs,
    targetPoolSize,
    discoveryInProgress: false,
  };
};

export const addRelay = (
  state: RelayPoolState,
  address: string,
): RelayPoolState => {
  if (state.relays.some((r) => r.address === address)) {
    return state;
  }

  return {
    ...state,
    relays: [
      ...state.relays,
      { address, status: "unknown", consecutiveFailures: 0, latencyMs: null },
    ],
  };
};

export const removeRelay = (
  state: RelayPoolState,
  address: string,
): RelayPoolState => {
  if (!state.relays.some((r) => r.address === address)) {
    return state;
  }

  return {
    ...state,
    relays: state.relays.filter((r) => r.address !== address),
  };
};

const isUsable = (relay: RelayEntry): boolean =>
  relay.status !== "unhealthy";

export const needsMoreRelays = (state: RelayPoolState): boolean =>
  state.relays.filter(isUsable).length < state.targetPoolSize;

export const markDiscoveryStarted = (
  state: RelayPoolState,
): RelayPoolState => ({
  ...state,
  discoveryInProgress: true,
});

export const markDiscoveryCompleted = (
  state: RelayPoolState,
): RelayPoolState => ({
  ...state,
  discoveryInProgress: false,
});

export const getActiveRelayCount = (state: RelayPoolState): number =>
  state.relays.filter(
    (r) => r.status === "healthy" || r.status === "degraded",
  ).length;

const hasLatency = (r: RelayEntry): r is RelayWithLatency =>
  r.latencyMs !== null;

export const selectBestRelays = (
  state: RelayPoolState,
  count: number,
): readonly string[] =>
  state.relays
    .filter(
      (r): r is RelayWithLatency =>
        r.status !== "unhealthy" && hasLatency(r),
    )
    .sort((a, b) => a.latencyMs - b.latencyMs)
    .slice(0, count)
    .map((r) => r.address);

export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
export const DEFAULT_FAILURE_THRESHOLD = 3;

type RelayStatus = "unknown" | "healthy" | "degraded" | "unhealthy";

type RelayEntry = {
  readonly address: string;
  readonly status: RelayStatus;
  readonly consecutiveFailures: number;
  readonly latencyMs: number | null;
};

type RelayHealthState = {
  readonly relays: readonly RelayEntry[];
  readonly failureThreshold: number;
  readonly healthCheckIntervalMs: number;
};

type CreateRelayHealthStateOptions = {
  readonly relayAddresses: readonly string[];
  readonly failureThreshold?: number;
  readonly healthCheckIntervalMs?: number;
};

export const createRelayHealthState = (
  options: CreateRelayHealthStateOptions,
): RelayHealthState => {
  const { relayAddresses } = options;
  const failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const healthCheckIntervalMs =
    options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  if (relayAddresses.length === 0) {
    throw new RangeError("At least one relay address is required");
  }

  const uniqueAddresses = new Set(relayAddresses);
  if (uniqueAddresses.size !== relayAddresses.length) {
    throw new RangeError("Duplicate relay addresses are not allowed");
  }

  if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
    throw new RangeError(
      `failureThreshold must be a positive integer, got ${failureThreshold}`,
    );
  }

  if (!Number.isFinite(healthCheckIntervalMs) || healthCheckIntervalMs <= 0) {
    throw new RangeError(
      `healthCheckIntervalMs must be a positive finite number, got ${healthCheckIntervalMs}`,
    );
  }

  return {
    relays: relayAddresses.map((address) => ({
      address,
      status: "unknown" as RelayStatus,
      consecutiveFailures: 0,
      latencyMs: null,
    })),
    failureThreshold,
    healthCheckIntervalMs,
  };
};

const findRelayIndex = (
  state: RelayHealthState,
  address: string,
): number => {
  const index = state.relays.findIndex((r) => r.address === address);
  if (index === -1) {
    throw new Error(`Unknown relay address: ${address}`);
  }
  return index;
};

export const recordHealthCheckSuccess = (
  state: RelayHealthState,
  address: string,
  latencyMs: number,
): RelayHealthState => {
  const index = findRelayIndex(state, address);
  return {
    ...state,
    relays: state.relays.map((relay, i) =>
      i === index
        ? { ...relay, status: "healthy" as RelayStatus, consecutiveFailures: 0, latencyMs }
        : relay,
    ),
  };
};

export const recordHealthCheckFailure = (
  state: RelayHealthState,
  address: string,
): RelayHealthState => {
  const index = findRelayIndex(state, address);
  const relay = state.relays[index];
  const newFailures = relay.consecutiveFailures + 1;
  const newStatus: RelayStatus =
    newFailures >= state.failureThreshold ? "unhealthy" : "degraded";

  return {
    ...state,
    relays: state.relays.map((r, i) =>
      i === index
        ? { ...r, status: newStatus, consecutiveFailures: newFailures }
        : r,
    ),
  };
};

export const selectBestRelay = (
  state: RelayHealthState,
): string | null => {
  const healthyRelays = state.relays
    .filter((r) => r.status === "healthy" && r.latencyMs !== null)
    .sort((a, b) => (a.latencyMs as number) - (b.latencyMs as number));

  if (healthyRelays.length > 0) {
    return healthyRelays[0].address;
  }

  const unknownRelay = state.relays.find((r) => r.status === "unknown");
  if (unknownRelay) {
    return unknownRelay.address;
  }

  return null;
};

export const getRelayStatus = (
  state: RelayHealthState,
  address: string,
): RelayStatus => {
  const index = findRelayIndex(state, address);
  return state.relays[index].status;
};

export const getHealthyRelayCount = (
  state: RelayHealthState,
): number => state.relays.filter((r) => r.status === "healthy").length;

export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
export const DEFAULT_FAILURE_THRESHOLD = 3;

export type RelayStatus = "unknown" | "healthy" | "degraded" | "unhealthy";

export type RelayEntry = {
  readonly address: string;
  readonly status: RelayStatus;
  readonly consecutiveFailures: number;
  readonly latencyMs: number | null;
};

export type RelayWithLatency = RelayEntry & { readonly latencyMs: number };

export type RelayHealthState = {
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
      status: "unknown",
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

const hasLatency = (r: RelayEntry): r is RelayWithLatency =>
  r.latencyMs !== null;

export const recordHealthCheckSuccess = <T extends RelayHealthState>(
  state: T,
  address: string,
  latencyMs: number,
): T => {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) {
    throw new RangeError(
      `latencyMs must be a positive finite number, got ${latencyMs}`,
    );
  }
  const index = findRelayIndex(state, address);
  return {
    ...state,
    relays: state.relays.map((relay, i) =>
      i === index
        ? { ...relay, status: "healthy" as const, consecutiveFailures: 0, latencyMs }
        : relay,
    ),
  } as T;
};

export const recordHealthCheckFailure = <T extends RelayHealthState>(
  state: T,
  address: string,
): T => {
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
  } as T;
};

export const selectBestRelay = (
  state: RelayHealthState,
): string | null => {
  const healthyRelays = state.relays
    .filter((r): r is RelayWithLatency => r.status === "healthy" && hasLatency(r))
    .sort((a, b) => a.latencyMs - b.latencyMs);

  if (healthyRelays.length > 0) {
    return healthyRelays[0].address;
  }

  const degradedRelays = state.relays
    .filter((r): r is RelayWithLatency => r.status === "degraded" && hasLatency(r))
    .sort((a, b) => a.latencyMs - b.latencyMs);

  if (degradedRelays.length > 0) {
    return degradedRelays[0].address;
  }

  return (
    state.relays.find((r) => r.status === "unknown")?.address ??
    state.relays.find((r) => r.status === "degraded")?.address ??
    null
  );
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

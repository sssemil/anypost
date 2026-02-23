export type RelayReservationStatus =
  | "idle"
  | "reserving"
  | "active"
  | "renewing"
  | "backoff"
  | "evicted";

export type RelayReservationEntry = {
  readonly peerId: string;
  readonly addresses: readonly string[];
  readonly rttMs: number | null;
  readonly status: RelayReservationStatus;
  readonly failureCount: number;
  readonly lastAttemptAt: number | null;
  readonly cooldownUntil: number | null;
  readonly activeSince: number | null;
  readonly expiresAt: number | null;
};

export type RelayReservationState = {
  readonly targetActive: number;
  readonly rotationCount: number;
  readonly entries: ReadonlyMap<string, RelayReservationEntry>;
};

export type RelayDialReason = "acquire" | "renew" | "rotate";

export type RelayDialRequest = {
  readonly peerId: string;
  readonly address: string;
  readonly reason: RelayDialReason;
};

type MutableRelayReservationEntry = {
  peerId: string;
  addresses: string[];
  rttMs: number | null;
  status: RelayReservationStatus;
  failureCount: number;
  lastAttemptAt: number | null;
  cooldownUntil: number | null;
  activeSince: number | null;
  expiresAt: number | null;
};

type MutableRelayReservationState = {
  targetActive: number;
  rotationCount: number;
  entries: Map<string, MutableRelayReservationEntry>;
};

type RelayReservationManagerOptions = {
  readonly targetActive?: number;
  readonly reservationTtlMs?: number;
  readonly renewAtFraction?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly dialAttemptTimeoutMs?: number;
  readonly maxPersistedHints?: number;
  readonly now?: () => number;
  readonly onStateChange?: (state: RelayReservationState) => void;
};

export type RelayReservationManager = {
  readonly ingestCandidate: (peerId: string, addresses: readonly string[]) => void;
  readonly ingestRelayAddress: (address: string) => void;
  readonly updateRtt: (peerId: string, rttMs: number) => void;
  readonly markReservationObserved: (peerId: string) => void;
  readonly markReservationLost: (peerId: string) => void;
  readonly syncObservedReservations: (activeRelayPeerIds: readonly string[]) => void;
  readonly getDialRequests: () => readonly RelayDialRequest[];
  readonly getPersistableRelayHints: (limit?: number) => readonly string[];
  readonly getState: () => RelayReservationState;
};

export const DEFAULT_TARGET_ACTIVE_RELAYS = 3;
const DEFAULT_RESERVATION_TTL_MS = 55 * 60_000;
const DEFAULT_RENEW_AT_FRACTION = 0.7;
const DEFAULT_BASE_BACKOFF_MS = 3_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_DIAL_ATTEMPT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_PERSISTED_HINTS = 6;

const EMPTY_ENTRY = (peerId: string): MutableRelayReservationEntry => ({
  peerId,
  addresses: [],
  rttMs: null,
  status: "idle",
  failureCount: 0,
  lastAttemptAt: null,
  cooldownUntil: null,
  activeSince: null,
  expiresAt: null,
});

const toSnapshot = (state: MutableRelayReservationState): RelayReservationState => {
  const entries = new Map<string, RelayReservationEntry>();
  for (const [peerId, entry] of state.entries) {
    entries.set(peerId, {
      peerId,
      addresses: [...entry.addresses],
      rttMs: entry.rttMs,
      status: entry.status,
      failureCount: entry.failureCount,
      lastAttemptAt: entry.lastAttemptAt,
      cooldownUntil: entry.cooldownUntil,
      activeSince: entry.activeSince,
      expiresAt: entry.expiresAt,
    });
  }

  return {
    targetActive: state.targetActive,
    rotationCount: state.rotationCount,
    entries,
  };
};

const mergeAddresses = (
  existing: readonly string[],
  incoming: readonly string[],
): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...incoming, ...existing]) {
    const addr = raw.trim();
    if (addr.length === 0 || seen.has(addr)) continue;
    seen.add(addr);
    deduped.push(addr);
    if (deduped.length >= 8) break;
  }
  return deduped;
};

const addressRttSort = (a: MutableRelayReservationEntry, b: MutableRelayReservationEntry): number => {
  if (a.rttMs === null && b.rttMs === null) return a.peerId.localeCompare(b.peerId);
  if (a.rttMs === null) return 1;
  if (b.rttMs === null) return -1;
  if (a.rttMs !== b.rttMs) return a.rttMs - b.rttMs;
  return a.peerId.localeCompare(b.peerId);
};

const statusPriority = (status: RelayReservationStatus): number => {
  switch (status) {
    case "active":
      return 5;
    case "renewing":
      return 4;
    case "reserving":
      return 3;
    case "idle":
      return 2;
    case "backoff":
      return 1;
    case "evicted":
      return 0;
  }
};

const backoffMs = (
  failures: number,
  baseMs: number,
  maxMs: number,
): number => {
  const uncapped = baseMs * 2 ** Math.max(0, failures - 1);
  return Math.min(uncapped, maxMs);
};

const relayPeerIdFromAddress = (address: string): string | null => {
  const trimmed = address.trim();
  if (trimmed.length === 0) return null;
  const marker = "/p2p/";
  const idx = trimmed.lastIndexOf(marker);
  if (idx === -1) return null;
  const peerId = trimmed.slice(idx + marker.length).split("/")[0];
  return peerId.length > 0 ? peerId : null;
};

export const createRelayReservationManager = (
  options: RelayReservationManagerOptions = {},
): RelayReservationManager => {
  const {
    targetActive = DEFAULT_TARGET_ACTIVE_RELAYS,
    reservationTtlMs = DEFAULT_RESERVATION_TTL_MS,
    renewAtFraction = DEFAULT_RENEW_AT_FRACTION,
    baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    dialAttemptTimeoutMs = DEFAULT_DIAL_ATTEMPT_TIMEOUT_MS,
    maxPersistedHints = DEFAULT_MAX_PERSISTED_HINTS,
    now = () => Date.now(),
    onStateChange,
  } = options;

  const state: MutableRelayReservationState = {
    targetActive,
    rotationCount: 0,
    entries: new Map(),
  };

  const emit = () => {
    onStateChange?.(toSnapshot(state));
  };

  const getEntry = (peerId: string): MutableRelayReservationEntry => {
    const existing = state.entries.get(peerId);
    if (existing) return existing;
    const created = EMPTY_ENTRY(peerId);
    state.entries.set(peerId, created);
    return created;
  };

  const markFailure = (entry: MutableRelayReservationEntry, atMs: number) => {
    const wasActive = entry.status === "active" || entry.status === "renewing";
    entry.failureCount += 1;
    entry.status = "backoff";
    entry.cooldownUntil = atMs + backoffMs(entry.failureCount, baseBackoffMs, maxBackoffMs);
    entry.lastAttemptAt = atMs;
    entry.activeSince = null;
    entry.expiresAt = null;
    if (wasActive) {
      state.rotationCount += 1;
    }
  };

  const clearStaleAttempts = (atMs: number) => {
    let changed = false;
    for (const entry of state.entries.values()) {
      if (entry.status !== "reserving" && entry.status !== "renewing") continue;
      if (entry.lastAttemptAt === null) continue;
      if (atMs - entry.lastAttemptAt <= dialAttemptTimeoutMs) continue;
      markFailure(entry, atMs);
      changed = true;
    }
    if (changed) emit();
  };

  const isRenewDue = (entry: MutableRelayReservationEntry, atMs: number): boolean => {
    if (entry.status !== "active") return false;
    if (entry.activeSince === null) return false;
    const renewAtMs = entry.activeSince + Math.floor(reservationTtlMs * renewAtFraction);
    return atMs >= renewAtMs;
  };

  const pickCandidates = (atMs: number): MutableRelayReservationEntry[] => {
    const candidates: MutableRelayReservationEntry[] = [];
    for (const entry of state.entries.values()) {
      if (entry.addresses.length === 0) continue;
      if (entry.status === "evicted") continue;
      if (entry.status === "active" || entry.status === "renewing" || entry.status === "reserving") continue;
      if (entry.cooldownUntil !== null && atMs < entry.cooldownUntil) continue;
      candidates.push(entry);
    }

    return candidates.sort((a, b) => {
      const statusDelta = statusPriority(b.status) - statusPriority(a.status);
      if (statusDelta !== 0) return statusDelta;
      if (a.failureCount !== b.failureCount) return a.failureCount - b.failureCount;
      return addressRttSort(a, b);
    });
  };

  const activeOrPendingCount = (): number => {
    let count = 0;
    for (const entry of state.entries.values()) {
      if (entry.status === "active" || entry.status === "renewing" || entry.status === "reserving") {
        count += 1;
      }
    }
    return count;
  };

  return {
    ingestCandidate: (peerId: string, addresses: readonly string[]) => {
      const entry = getEntry(peerId);
      const merged = mergeAddresses(entry.addresses, addresses);
      if (merged.length === 0) return;
      entry.addresses = merged;
      emit();
    },

    ingestRelayAddress: (address: string) => {
      const peerId = relayPeerIdFromAddress(address);
      if (!peerId) return;
      const entry = getEntry(peerId);
      entry.addresses = mergeAddresses(entry.addresses, [address]);
      emit();
    },

    updateRtt: (peerId: string, rttMs: number) => {
      if (!Number.isFinite(rttMs) || rttMs <= 0) return;
      const entry = getEntry(peerId);
      entry.rttMs = rttMs;
      emit();
    },

    markReservationObserved: (peerId: string) => {
      const atMs = now();
      const entry = getEntry(peerId);
      entry.status = "active";
      entry.failureCount = 0;
      entry.cooldownUntil = null;
      entry.lastAttemptAt = atMs;
      entry.activeSince = entry.activeSince ?? atMs;
      entry.expiresAt = atMs + reservationTtlMs;
      emit();
    },

    markReservationLost: (peerId: string) => {
      const entry = state.entries.get(peerId);
      if (!entry) return;
      markFailure(entry, now());
      emit();
    },

    syncObservedReservations: (activeRelayPeerIds: readonly string[]) => {
      const active = new Set(activeRelayPeerIds);
      const atMs = now();
      let changed = false;
      for (const entry of state.entries.values()) {
        if (entry.status !== "active" && entry.status !== "renewing") continue;
        if (active.has(entry.peerId)) continue;
        markFailure(entry, atMs);
        changed = true;
      }
      if (changed) emit();
    },

    getDialRequests: () => {
      const atMs = now();
      clearStaleAttempts(atMs);

      const requests: RelayDialRequest[] = [];
      let changed = false;

      const renewals = [...state.entries.values()]
        .filter((entry) => isRenewDue(entry, atMs) && entry.addresses.length > 0)
        .sort(addressRttSort);

      for (const entry of renewals) {
        entry.status = "renewing";
        entry.lastAttemptAt = atMs;
        requests.push({
          peerId: entry.peerId,
          address: entry.addresses[0],
          reason: "renew",
        });
        changed = true;
      }

      const missing = Math.max(0, state.targetActive - activeOrPendingCount());
      if (missing > 0) {
        const candidates = pickCandidates(atMs).slice(0, missing);
        for (const entry of candidates) {
          const reason: RelayDialReason = entry.failureCount >= 2 ? "rotate" : "acquire";
          entry.status = "reserving";
          entry.lastAttemptAt = atMs;
          requests.push({
            peerId: entry.peerId,
            address: entry.addresses[0],
            reason,
          });
          changed = true;
        }
      }

      if (changed) emit();
      return requests;
    },

    getPersistableRelayHints: (limit = maxPersistedHints) => {
      return [...state.entries.values()]
        .filter((entry) => entry.addresses.length > 0 && entry.status !== "evicted")
        .sort((a, b) => {
          const statusDelta = statusPriority(b.status) - statusPriority(a.status);
          if (statusDelta !== 0) return statusDelta;
          return addressRttSort(a, b);
        })
        .slice(0, Math.max(0, limit))
        .map((entry) => entry.addresses[0]);
    },

    getState: () => toSnapshot(state),
  };
};

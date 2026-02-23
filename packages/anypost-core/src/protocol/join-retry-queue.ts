export type JoinRetryStatus = "active" | "paused" | "cancelled";

export type JoinRetryEntry = {
  readonly groupId: string;
  readonly createdAt: number;
  readonly lastAttemptAt: number | null;
  readonly nextAttemptAt: number;
  readonly attemptCount: number;
  readonly status: JoinRetryStatus;
};

export type JoinRetryState = ReadonlyMap<string, JoinRetryEntry>;

type JitterOptions = {
  readonly random?: () => number;
  readonly jitterRatio?: number;
};

const INITIAL_DELAY_MS = 5_000;
const SECOND_DELAY_MS = 15_000;
const THIRD_DELAY_MS = 30_000;
const FOURTH_DELAY_MS = 60_000;
const STEADY_DELAY_MS = 5 * 60_000;

const DEFAULT_JITTER_RATIO = 0.2;

const cloneState = (state: JoinRetryState): Map<string, JoinRetryEntry> => new Map(state);

export const createJoinRetryState = (
  entries?: Iterable<readonly [string, JoinRetryEntry]>,
): JoinRetryState => new Map(entries ?? []);

export const getJoinRetryDelayMs = (
  attemptCount: number,
  options: JitterOptions = {},
): number => {
  const random = options.random ?? Math.random;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;

  const base = attemptCount <= 1
    ? INITIAL_DELAY_MS
    : attemptCount === 2
      ? SECOND_DELAY_MS
      : attemptCount === 3
        ? THIRD_DELAY_MS
        : attemptCount === 4
          ? FOURTH_DELAY_MS
          : STEADY_DELAY_MS;

  const jitter = Math.floor(base * Math.max(0, jitterRatio) * Math.max(0, Math.min(1, random())));
  return base + jitter;
};

export const enqueueJoinRetry = (
  state: JoinRetryState,
  groupId: string,
  now: number,
): JoinRetryState => {
  const existing = state.get(groupId);
  const next = cloneState(state);

  if (existing) {
    next.set(groupId, {
      ...existing,
      status: "active",
      nextAttemptAt: Math.min(existing.nextAttemptAt, now),
    });
    return next;
  }

  next.set(groupId, {
    groupId,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    attemptCount: 0,
    status: "active",
  });
  return next;
};

export const recordJoinRetryAttempt = (
  state: JoinRetryState,
  groupId: string,
  now: number,
  options: JitterOptions = {},
): JoinRetryState => {
  const seeded = enqueueJoinRetry(state, groupId, now);
  const current = seeded.get(groupId);
  if (!current) return seeded;

  const nextAttemptCount = current.attemptCount + 1;
  const delayMs = getJoinRetryDelayMs(nextAttemptCount, options);

  const next = cloneState(seeded);
  next.set(groupId, {
    ...current,
    status: "active",
    attemptCount: nextAttemptCount,
    lastAttemptAt: now,
    nextAttemptAt: now + delayMs,
  });
  return next;
};

export const scheduleNextJoinRetry = (
  state: JoinRetryState,
  groupId: string,
  nextAttemptAt: number,
): JoinRetryState => {
  const current = state.get(groupId);
  if (!current) return state;

  const next = cloneState(state);
  next.set(groupId, {
    ...current,
    nextAttemptAt,
  });
  return next;
};

export const removeJoinRetry = (
  state: JoinRetryState,
  groupId: string,
): JoinRetryState => {
  if (!state.has(groupId)) return state;
  const next = cloneState(state);
  next.delete(groupId);
  return next;
};

export const markJoinRetryCancelled = (
  state: JoinRetryState,
  groupId: string,
): JoinRetryState => {
  const current = state.get(groupId);
  if (!current) return state;

  const next = cloneState(state);
  next.set(groupId, {
    ...current,
    status: "cancelled",
    nextAttemptAt: Number.POSITIVE_INFINITY,
  });
  return next;
};

export const dueJoinRetries = (
  state: JoinRetryState,
  now: number,
): readonly JoinRetryEntry[] =>
  [...state.values()]
    .filter((entry) => entry.status === "active" && entry.nextAttemptAt <= now)
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);

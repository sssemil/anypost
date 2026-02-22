export const DEFAULT_BASE_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 30_000;

type BackoffState = {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

type CreateBackoffOptions = {
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
};

export const createBackoffState = (
  options?: CreateBackoffOptions,
): BackoffState => ({
  attempts: 0,
  baseDelayMs: options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  maxDelayMs: options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
});

export const recordFailure = (state: BackoffState): BackoffState => ({
  ...state,
  attempts: state.attempts + 1,
});

export const recordSuccess = (state: BackoffState): BackoffState => ({
  ...state,
  attempts: 0,
});

export const getNextDelay = (state: BackoffState): number =>
  Math.min(
    state.baseDelayMs * Math.pow(2, state.attempts),
    state.maxDelayMs,
  );

export const getAttemptCount = (state: BackoffState): number => state.attempts;

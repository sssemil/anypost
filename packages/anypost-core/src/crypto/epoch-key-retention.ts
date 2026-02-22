import type { MlsGroupState } from "./mls-manager.js";

const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_MAX_EPOCH_COUNT = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RetentionConfig = {
  readonly maxAgeDays: number;
  readonly maxEpochCount: number;
};

export type EpochRecord = {
  readonly epoch: bigint;
  readonly recordedAt: number;
};

export type EpochTracker = {
  readonly groupId: string;
  readonly epochs: readonly EpochRecord[];
};

export const createRetentionConfig = (
  overrides?: Partial<RetentionConfig>,
): RetentionConfig => ({
  maxAgeDays: overrides?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
  maxEpochCount: overrides?.maxEpochCount ?? DEFAULT_MAX_EPOCH_COUNT,
});

export const createEpochTracker = (groupId: string): EpochTracker => ({
  groupId,
  epochs: [],
});

export const recordEpoch = (
  tracker: EpochTracker,
  epoch: bigint,
  now: number = Date.now(),
): EpochTracker => {
  const exists = tracker.epochs.some((r) => r.epoch === epoch);
  if (exists) return tracker;

  return {
    ...tracker,
    epochs: [...tracker.epochs, { epoch, recordedAt: now }],
  };
};

export const getExpiredEpochs = (
  tracker: EpochTracker,
  config: RetentionConfig,
  now: number = Date.now(),
): readonly bigint[] => {
  if (tracker.epochs.length === 0) return [];

  const maxAgeMs = config.maxAgeDays * MS_PER_DAY;
  const sortedByEpoch = [...tracker.epochs].sort(
    (a, b) => Number(b.epoch - a.epoch),
  );
  const latestN = new Set(
    sortedByEpoch.slice(0, config.maxEpochCount).map((r) => r.epoch),
  );

  return tracker.epochs
    .filter((r) => {
      const tooOld = now - r.recordedAt > maxAgeMs;
      const beyondCount = !latestN.has(r.epoch);
      return tooOld || beyondCount;
    })
    .map((r) => r.epoch);
};

export const pruneTracker = (
  tracker: EpochTracker,
  config: RetentionConfig,
  now: number = Date.now(),
): EpochTracker => {
  const expired = new Set(getExpiredEpochs(tracker, config, now));
  return {
    ...tracker,
    epochs: tracker.epochs.filter((r) => !expired.has(r.epoch)),
  };
};

type PruneGroupStateOptions = {
  readonly groupState: MlsGroupState;
  readonly expiredEpochs: readonly bigint[];
};

export const pruneGroupState = (
  options: PruneGroupStateOptions,
): MlsGroupState => {
  const expiredSet = new Set(options.expiredEpochs);
  const oldData = options.groupState.clientState.historicalReceiverData;
  const newData = new Map(
    [...oldData].filter(([epoch]) => !expiredSet.has(epoch)),
  );

  return {
    clientState: {
      ...options.groupState.clientState,
      historicalReceiverData: newData,
    },
  };
};

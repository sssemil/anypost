import { zeroOutUint8Array } from "ts-mls";
import type { SecretTree, GenerationSecret } from "ts-mls";
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
): RetentionConfig => {
  const maxAgeDays = overrides?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const maxEpochCount = overrides?.maxEpochCount ?? DEFAULT_MAX_EPOCH_COUNT;

  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new RangeError(`maxAgeDays must be a positive finite number, got ${maxAgeDays}`);
  }
  if (!Number.isInteger(maxEpochCount) || maxEpochCount < 1) {
    throw new RangeError(`maxEpochCount must be a positive integer, got ${maxEpochCount}`);
  }

  return { maxAgeDays, maxEpochCount };
};

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
  const sortedByEpoch = [...tracker.epochs].sort((a, b) => {
    if (b.epoch > a.epoch) return 1;
    if (b.epoch < a.epoch) return -1;
    return 0;
  });
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

const zeroGenerationSecret = (gs: GenerationSecret): void => {
  zeroOutUint8Array(gs.secret);
  Object.values(gs.unusedGenerations).forEach(zeroOutUint8Array);
};

const zeroSecretTree = (tree: SecretTree): void => {
  Object.values(tree.intermediateNodes).forEach(zeroOutUint8Array);
  Object.values(tree.leafNodes).forEach((node) => {
    zeroGenerationSecret(node.handshake);
    zeroGenerationSecret(node.application);
  });
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
  const newData = new Map(oldData);

  for (const [epoch, data] of oldData) {
    if (expiredSet.has(epoch)) {
      zeroOutUint8Array(data.resumptionPsk);
      zeroOutUint8Array(data.senderDataSecret);
      zeroSecretTree(data.secretTree);
      newData.delete(epoch);
    }
  }

  return {
    ...options.groupState,
    clientState: {
      ...options.groupState.clientState,
      historicalReceiverData: newData,
    },
  };
};

export const DEFAULT_MESSAGE_THRESHOLD = 10_000;
export const DEFAULT_RETAINED_MESSAGE_COUNT = 1000;

type CompactionPolicy = {
  readonly messageThreshold: number;
  readonly retainedMessageCount: number;
  readonly compactionCount: number;
  readonly lastCompactionAt: number | null;
};

type CreateCompactionPolicyOptions = {
  readonly messageThreshold?: number;
  readonly retainedMessageCount?: number;
};

type RetainedWindow = {
  readonly startIndex: number;
  readonly count: number;
};

export const createCompactionPolicy = (
  options?: CreateCompactionPolicyOptions,
): CompactionPolicy => {
  const messageThreshold =
    options?.messageThreshold ?? DEFAULT_MESSAGE_THRESHOLD;
  const retainedMessageCount =
    options?.retainedMessageCount ?? DEFAULT_RETAINED_MESSAGE_COUNT;

  if (!Number.isFinite(messageThreshold) || messageThreshold < 1) {
    throw new RangeError(
      `messageThreshold must be a positive finite number, got ${messageThreshold}`,
    );
  }
  if (!Number.isFinite(retainedMessageCount) || retainedMessageCount < 1) {
    throw new RangeError(
      `retainedMessageCount must be a positive finite number, got ${retainedMessageCount}`,
    );
  }
  if (retainedMessageCount > messageThreshold) {
    throw new RangeError(
      `retainedMessageCount (${retainedMessageCount}) must be <= messageThreshold (${messageThreshold})`,
    );
  }

  return {
    messageThreshold,
    retainedMessageCount,
    compactionCount: 0,
    lastCompactionAt: null,
  };
};

export const isCompactionNeeded = (
  policy: CompactionPolicy,
  messageCount: number,
): boolean => messageCount >= policy.messageThreshold;

export const calculateRetainedWindow = (
  policy: CompactionPolicy,
  totalMessageCount: number,
): RetainedWindow => {
  if (totalMessageCount <= policy.retainedMessageCount) {
    return { startIndex: 0, count: totalMessageCount };
  }
  return {
    startIndex: totalMessageCount - policy.retainedMessageCount,
    count: policy.retainedMessageCount,
  };
};

export const recordCompaction = (
  policy: CompactionPolicy,
  timestamp: number,
): CompactionPolicy => ({
  ...policy,
  compactionCount: policy.compactionCount + 1,
  lastCompactionAt: timestamp,
});

export const getLastCompactionTime = (
  policy: CompactionPolicy,
): number | null => policy.lastCompactionAt;

export const getCompactionCount = (
  policy: CompactionPolicy,
): number => policy.compactionCount;

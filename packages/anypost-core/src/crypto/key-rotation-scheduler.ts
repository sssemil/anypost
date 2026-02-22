export const DEFAULT_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ROTATION_MESSAGE_THRESHOLD = 1000;

type RotationSchedulerState = {
  readonly lastRotationAt: number;
  readonly messagesSinceRotation: number;
  readonly rotationIntervalMs: number;
  readonly messageThreshold: number;
};

type CreateRotationSchedulerOptions = {
  readonly now: number;
  readonly rotationIntervalMs?: number;
  readonly messageThreshold?: number;
};

export const createRotationScheduler = (
  options: CreateRotationSchedulerOptions,
): RotationSchedulerState => ({
  lastRotationAt: options.now,
  messagesSinceRotation: 0,
  rotationIntervalMs:
    options.rotationIntervalMs ?? DEFAULT_ROTATION_INTERVAL_MS,
  messageThreshold:
    options.messageThreshold ?? DEFAULT_ROTATION_MESSAGE_THRESHOLD,
});

export const recordRotation = (
  state: RotationSchedulerState,
  now: number,
): RotationSchedulerState => ({
  ...state,
  lastRotationAt: now,
  messagesSinceRotation: 0,
});

export const recordMessage = (
  state: RotationSchedulerState,
): RotationSchedulerState => ({
  ...state,
  messagesSinceRotation: state.messagesSinceRotation + 1,
});

export const isRotationDue = (
  state: RotationSchedulerState,
  now: number,
): boolean =>
  now - state.lastRotationAt > state.rotationIntervalMs ||
  state.messagesSinceRotation >= state.messageThreshold;

export const getMessagesSinceRotation = (
  state: RotationSchedulerState,
): number => state.messagesSinceRotation;

export const getTimeSinceRotation = (
  state: RotationSchedulerState,
  now: number,
): number => now - state.lastRotationAt;

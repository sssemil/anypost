import { describe, it, expect } from "vitest";
import {
  createJoinRetryState,
  enqueueJoinRetry,
  recordJoinRetryAttempt,
  scheduleNextJoinRetry,
  removeJoinRetry,
  markJoinRetryCancelled,
  dueJoinRetries,
  getJoinRetryDelayMs,
} from "./join-retry-queue.js";

describe("join retry queue", () => {
  it("should enqueue a new active retry entry", () => {
    const state = createJoinRetryState();
    const next = enqueueJoinRetry(state, "group-a", 1000);

    const entry = next.get("group-a");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("active");
    expect(entry!.attemptCount).toBe(0);
    expect(entry!.nextAttemptAt).toBe(1000);
  });

  it("should compute expected backoff progression", () => {
    expect(getJoinRetryDelayMs(1, { random: () => 0, jitterRatio: 0 })).toBe(5_000);
    expect(getJoinRetryDelayMs(2, { random: () => 0, jitterRatio: 0 })).toBe(15_000);
    expect(getJoinRetryDelayMs(3, { random: () => 0, jitterRatio: 0 })).toBe(30_000);
    expect(getJoinRetryDelayMs(4, { random: () => 0, jitterRatio: 0 })).toBe(60_000);
    expect(getJoinRetryDelayMs(5, { random: () => 0, jitterRatio: 0 })).toBe(300_000);
  });

  it("should record attempts and schedule next retry", () => {
    const initial = enqueueJoinRetry(createJoinRetryState(), "group-a", 1000);
    const afterAttempt = recordJoinRetryAttempt(initial, "group-a", 1000, {
      random: () => 0,
      jitterRatio: 0,
    });

    const entry = afterAttempt.get("group-a")!;
    expect(entry.attemptCount).toBe(1);
    expect(entry.lastAttemptAt).toBe(1000);
    expect(entry.nextAttemptAt).toBe(6000);

    const manuallyScheduled = scheduleNextJoinRetry(afterAttempt, "group-a", 7000);
    expect(manuallyScheduled.get("group-a")!.nextAttemptAt).toBe(7000);
  });

  it("should return only active due retries", () => {
    let state = createJoinRetryState();
    state = enqueueJoinRetry(state, "group-a", 1000);
    state = enqueueJoinRetry(state, "group-b", 1000);

    state = markJoinRetryCancelled(state, "group-b");
    state = scheduleNextJoinRetry(state, "group-a", 1200);

    expect(dueJoinRetries(state, 1199)).toHaveLength(0);
    const due = dueJoinRetries(state, 1200);
    expect(due).toHaveLength(1);
    expect(due[0].groupId).toBe("group-a");
  });

  it("should remove entries", () => {
    let state = createJoinRetryState();
    state = enqueueJoinRetry(state, "group-a", 1000);
    state = removeJoinRetry(state, "group-a");

    expect(state.has("group-a")).toBe(false);
  });
});

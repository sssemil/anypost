import { describe, it, expect } from "vitest";
import {
  createCompactionPolicy,
  isCompactionNeeded,
  calculateRetainedWindow,
  recordCompaction,
  getLastCompactionTime,
  getCompactionCount,
  DEFAULT_MESSAGE_THRESHOLD,
  DEFAULT_RETAINED_MESSAGE_COUNT,
} from "./compaction-policy.js";

describe("createCompactionPolicy", () => {
  it("should start with zero compactions", () => {
    const policy = createCompactionPolicy();

    expect(getCompactionCount(policy)).toBe(0);
  });

  it("should start with no last compaction time", () => {
    const policy = createCompactionPolicy();

    expect(getLastCompactionTime(policy)).toBe(null);
  });

  it("should use custom message threshold", () => {
    const policy = createCompactionPolicy({
      messageThreshold: 5000,
      retainedMessageCount: 500,
    });

    expect(isCompactionNeeded(policy, 4999)).toBe(false);
    expect(isCompactionNeeded(policy, 5000)).toBe(true);
  });

  it("should use custom retained message count", () => {
    const policy = createCompactionPolicy({
      messageThreshold: 5000,
      retainedMessageCount: 500,
    });

    const window = calculateRetainedWindow(policy, 5000);

    expect(window.startIndex).toBe(4500);
    expect(window.count).toBe(500);
  });
});

describe("isCompactionNeeded", () => {
  it("should not need compaction when message count is below threshold", () => {
    const policy = createCompactionPolicy();

    expect(isCompactionNeeded(policy, 100)).toBe(false);
  });

  it("should need compaction when message count reaches threshold", () => {
    const policy = createCompactionPolicy();

    expect(isCompactionNeeded(policy, DEFAULT_MESSAGE_THRESHOLD)).toBe(true);
  });

  it("should need compaction when message count exceeds threshold", () => {
    const policy = createCompactionPolicy();

    expect(isCompactionNeeded(policy, DEFAULT_MESSAGE_THRESHOLD + 1)).toBe(true);
  });

  it("should use custom threshold", () => {
    const policy = createCompactionPolicy({
      messageThreshold: 500,
      retainedMessageCount: 100,
    });

    expect(isCompactionNeeded(policy, 499)).toBe(false);
    expect(isCompactionNeeded(policy, 500)).toBe(true);
  });
});

describe("calculateRetainedWindow", () => {
  it("should retain all messages when total is under limit", () => {
    const policy = createCompactionPolicy();

    const window = calculateRetainedWindow(policy, 100);

    expect(window.startIndex).toBe(0);
    expect(window.count).toBe(100);
  });

  it("should retain only recent messages when total exceeds limit", () => {
    const policy = createCompactionPolicy({ retainedMessageCount: 1000 });

    const window = calculateRetainedWindow(policy, 5000);

    expect(window.startIndex).toBe(4000);
    expect(window.count).toBe(1000);
  });

  it("should retain exactly retainedMessageCount messages", () => {
    const policy = createCompactionPolicy({ retainedMessageCount: 500 });

    const window = calculateRetainedWindow(policy, 2000);

    expect(window.count).toBe(500);
    expect(window.startIndex).toBe(1500);
  });

  it("should handle total equal to retained count", () => {
    const policy = createCompactionPolicy({ retainedMessageCount: 1000 });

    const window = calculateRetainedWindow(policy, 1000);

    expect(window.startIndex).toBe(0);
    expect(window.count).toBe(1000);
  });

  it("should handle zero messages", () => {
    const policy = createCompactionPolicy();

    const window = calculateRetainedWindow(policy, 0);

    expect(window.startIndex).toBe(0);
    expect(window.count).toBe(0);
  });

  it("should reject negative totalMessageCount", () => {
    const policy = createCompactionPolicy();

    expect(() => calculateRetainedWindow(policy, -1)).toThrow(RangeError);
  });
});

describe("recordCompaction", () => {
  it("should increment compaction count", () => {
    const policy = createCompactionPolicy();

    const updated = recordCompaction(policy, 1000);

    expect(getCompactionCount(updated)).toBe(1);
  });

  it("should record compaction timestamp", () => {
    const policy = createCompactionPolicy();

    const updated = recordCompaction(policy, 1000);

    expect(getLastCompactionTime(updated)).toBe(1000);
  });

  it("should accumulate multiple compactions", () => {
    let policy = createCompactionPolicy();
    policy = recordCompaction(policy, 1000);
    policy = recordCompaction(policy, 2000);

    expect(getCompactionCount(policy)).toBe(2);
    expect(getLastCompactionTime(policy)).toBe(2000);
  });
});

describe("immutability", () => {
  it("should not mutate original on recordCompaction", () => {
    const original = createCompactionPolicy();
    recordCompaction(original, 1000);

    expect(getCompactionCount(original)).toBe(0);
    expect(getLastCompactionTime(original)).toBe(null);
  });
});

describe("input validation", () => {
  it("should reject non-positive messageThreshold", () => {
    expect(() => createCompactionPolicy({ messageThreshold: 0 })).toThrow(RangeError);
  });

  it("should reject negative messageThreshold", () => {
    expect(() => createCompactionPolicy({ messageThreshold: -1 })).toThrow(RangeError);
  });

  it("should reject non-positive retainedMessageCount", () => {
    expect(() => createCompactionPolicy({ retainedMessageCount: 0 })).toThrow(RangeError);
  });

  it("should reject non-integer messageThreshold", () => {
    expect(() => createCompactionPolicy({ messageThreshold: 500.5 })).toThrow(RangeError);
  });

  it("should reject non-integer retainedMessageCount", () => {
    expect(() => createCompactionPolicy({ retainedMessageCount: 100.5 })).toThrow(RangeError);
  });

  it("should reject retainedMessageCount greater than messageThreshold", () => {
    expect(() =>
      createCompactionPolicy({ messageThreshold: 100, retainedMessageCount: 200 }),
    ).toThrow(RangeError);
  });

  it("should reject retainedMessageCount equal to messageThreshold", () => {
    expect(() =>
      createCompactionPolicy({ messageThreshold: 100, retainedMessageCount: 100 }),
    ).toThrow(RangeError);
  });
});

describe("defaults", () => {
  it("should have 10000 message threshold", () => {
    expect(DEFAULT_MESSAGE_THRESHOLD).toBe(10_000);
  });

  it("should have 1000 retained message count", () => {
    expect(DEFAULT_RETAINED_MESSAGE_COUNT).toBe(1000);
  });
});

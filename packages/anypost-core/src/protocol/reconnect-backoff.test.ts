import { describe, it, expect } from "vitest";
import {
  createBackoffState,
  recordFailure,
  recordSuccess,
  getNextDelay,
  getAttemptCount,
  applyJitter,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
} from "./reconnect-backoff.js";

describe("Reconnect backoff", () => {
  describe("createBackoffState", () => {
    it("should start with zero attempts", () => {
      const state = createBackoffState();

      expect(getAttemptCount(state)).toBe(0);
    });

    it("should accept custom base delay and max delay", () => {
      const state = createBackoffState({
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      });

      expect(getAttemptCount(state)).toBe(0);
    });
  });

  describe("getNextDelay", () => {
    it("should return base delay for first attempt", () => {
      const state = createBackoffState();

      const delay = getNextDelay(state);

      expect(delay).toBe(DEFAULT_BASE_DELAY_MS);
    });

    it("should double delay after each failure", () => {
      let state = createBackoffState();
      state = recordFailure(state);

      expect(getNextDelay(state)).toBe(DEFAULT_BASE_DELAY_MS * 2);
    });

    it("should cap delay at max delay", () => {
      let state = createBackoffState({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
      });
      state = recordFailure(state);
      state = recordFailure(state);
      state = recordFailure(state);

      expect(getNextDelay(state)).toBe(5000);
    });

    it("should use custom base delay", () => {
      const state = createBackoffState({ baseDelayMs: 500 });

      expect(getNextDelay(state)).toBe(500);
    });
  });

  describe("recordFailure", () => {
    it("should increment attempt count", () => {
      const state = createBackoffState();

      const updated = recordFailure(state);

      expect(getAttemptCount(updated)).toBe(1);
    });

    it("should accumulate multiple failures", () => {
      let state = createBackoffState();
      state = recordFailure(state);
      state = recordFailure(state);
      state = recordFailure(state);

      expect(getAttemptCount(state)).toBe(3);
    });
  });

  describe("recordSuccess", () => {
    it("should reset attempt count to zero", () => {
      let state = createBackoffState();
      state = recordFailure(state);
      state = recordFailure(state);

      const updated = recordSuccess(state);

      expect(getAttemptCount(updated)).toBe(0);
    });

    it("should reset delay to base", () => {
      let state = createBackoffState();
      state = recordFailure(state);
      state = recordFailure(state);

      const updated = recordSuccess(state);

      expect(getNextDelay(updated)).toBe(DEFAULT_BASE_DELAY_MS);
    });
  });

  describe("immutability", () => {
    it("should not mutate original on failure", () => {
      const original = createBackoffState();
      recordFailure(original);

      expect(getAttemptCount(original)).toBe(0);
    });

    it("should not mutate original on success", () => {
      let state = createBackoffState();
      state = recordFailure(state);
      recordSuccess(state);

      expect(getAttemptCount(state)).toBe(1);
    });
  });

  describe("input validation", () => {
    it("should reject NaN baseDelayMs", () => {
      expect(() => createBackoffState({ baseDelayMs: NaN })).toThrow(RangeError);
    });

    it("should reject negative baseDelayMs", () => {
      expect(() => createBackoffState({ baseDelayMs: -1 })).toThrow(RangeError);
    });

    it("should reject zero baseDelayMs", () => {
      expect(() => createBackoffState({ baseDelayMs: 0 })).toThrow(RangeError);
    });

    it("should reject Infinity maxDelayMs", () => {
      expect(() => createBackoffState({ maxDelayMs: Infinity })).toThrow(RangeError);
    });

    it("should reject negative maxDelayMs", () => {
      expect(() => createBackoffState({ maxDelayMs: -5 })).toThrow(RangeError);
    });

    it("should reject maxDelayMs less than baseDelayMs", () => {
      expect(() =>
        createBackoffState({ baseDelayMs: 5000, maxDelayMs: 1000 }),
      ).toThrow(RangeError);
    });
  });

  describe("applyJitter", () => {
    it("should return a value between 50% and 100% of delay", () => {
      const delay = 1000;
      const result = applyJitter(delay, () => 0.5);

      expect(result).toBe(750);
    });

    it("should return full delay when rng returns 1", () => {
      expect(applyJitter(1000, () => 1)).toBe(1000);
    });

    it("should return half delay when rng returns 0", () => {
      expect(applyJitter(1000, () => 0)).toBe(500);
    });
  });

  describe("defaults", () => {
    it("should have 1 second base delay", () => {
      expect(DEFAULT_BASE_DELAY_MS).toBe(1000);
    });

    it("should have 30 second max delay", () => {
      expect(DEFAULT_MAX_DELAY_MS).toBe(30_000);
    });
  });
});

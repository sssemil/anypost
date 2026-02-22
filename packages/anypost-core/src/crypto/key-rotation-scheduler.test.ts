import { describe, it, expect } from "vitest";
import {
  createRotationScheduler,
  recordRotation,
  recordMessage,
  isRotationDue,
  getMessagesSinceRotation,
  getTimeSinceRotation,
  DEFAULT_ROTATION_INTERVAL_MS,
  DEFAULT_ROTATION_MESSAGE_THRESHOLD,
} from "./key-rotation-scheduler.js";

describe("Key rotation scheduler", () => {
  describe("createRotationScheduler", () => {
    it("should create scheduler with default configuration", () => {
      const scheduler = createRotationScheduler({ now: 1000 });

      expect(getMessagesSinceRotation(scheduler)).toBe(0);
      expect(getTimeSinceRotation(scheduler, 1000)).toBe(0);
    });

    it("should accept custom rotation interval and message threshold", () => {
      const scheduler = createRotationScheduler({
        now: 1000,
        rotationIntervalMs: 3600_000,
        messageThreshold: 500,
      });

      expect(isRotationDue(scheduler, 1000)).toBe(false);
    });
  });

  describe("isRotationDue", () => {
    it("should not be due immediately after creation", () => {
      const scheduler = createRotationScheduler({ now: 1000 });

      expect(isRotationDue(scheduler, 1000)).toBe(false);
    });

    it("should be due after time interval elapses", () => {
      const scheduler = createRotationScheduler({ now: 1000 });

      expect(
        isRotationDue(scheduler, 1000 + DEFAULT_ROTATION_INTERVAL_MS + 1),
      ).toBe(true);
    });

    it("should not be due at exactly the interval boundary", () => {
      const scheduler = createRotationScheduler({ now: 1000 });

      expect(
        isRotationDue(scheduler, 1000 + DEFAULT_ROTATION_INTERVAL_MS),
      ).toBe(false);
    });

    it("should be due when message threshold is reached", () => {
      let scheduler = createRotationScheduler({
        now: 1000,
        messageThreshold: 3,
      });
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);

      expect(isRotationDue(scheduler, 1000)).toBe(true);
    });

    it("should not be due when message count is below threshold", () => {
      let scheduler = createRotationScheduler({
        now: 1000,
        messageThreshold: 3,
      });
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);

      expect(isRotationDue(scheduler, 1000)).toBe(false);
    });

    it("should be due when either condition is met (time)", () => {
      const scheduler = createRotationScheduler({
        now: 1000,
        rotationIntervalMs: 5000,
        messageThreshold: 1000,
      });

      expect(isRotationDue(scheduler, 6001)).toBe(true);
    });

    it("should be due when either condition is met (messages)", () => {
      let scheduler = createRotationScheduler({
        now: 1000,
        rotationIntervalMs: 999_999_999,
        messageThreshold: 2,
      });
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);

      expect(isRotationDue(scheduler, 1001)).toBe(true);
    });
  });

  describe("recordRotation", () => {
    it("should reset message count and update last rotation time", () => {
      let scheduler = createRotationScheduler({ now: 1000 });
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);

      const updated = recordRotation(scheduler, 5000);

      expect(getMessagesSinceRotation(updated)).toBe(0);
      expect(getTimeSinceRotation(updated, 5000)).toBe(0);
    });

    it("should make rotation no longer due after recording", () => {
      let scheduler = createRotationScheduler({
        now: 1000,
        messageThreshold: 2,
      });
      scheduler = recordMessage(scheduler);
      scheduler = recordMessage(scheduler);
      expect(isRotationDue(scheduler, 1000)).toBe(true);

      const updated = recordRotation(scheduler, 2000);

      expect(isRotationDue(updated, 2000)).toBe(false);
    });
  });

  describe("recordMessage", () => {
    it("should increment message count", () => {
      const scheduler = createRotationScheduler({ now: 1000 });

      const updated = recordMessage(scheduler);

      expect(getMessagesSinceRotation(updated)).toBe(1);
    });
  });

  describe("immutability", () => {
    it("should not mutate original when recording message", () => {
      const original = createRotationScheduler({ now: 1000 });
      recordMessage(original);

      expect(getMessagesSinceRotation(original)).toBe(0);
    });

    it("should not mutate original when recording rotation", () => {
      let scheduler = createRotationScheduler({ now: 1000 });
      scheduler = recordMessage(scheduler);
      recordRotation(scheduler, 5000);

      expect(getMessagesSinceRotation(scheduler)).toBe(1);
    });
  });

  describe("defaults", () => {
    it("should have 24 hour default rotation interval", () => {
      expect(DEFAULT_ROTATION_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    });

    it("should have 1000 message default threshold", () => {
      expect(DEFAULT_ROTATION_MESSAGE_THRESHOLD).toBe(1000);
    });
  });
});

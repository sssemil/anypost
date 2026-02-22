import { describe, it, expect } from "vitest";
import {
  createStewardFailoverState,
  recordStewardHeartbeat,
  isStewardOffline,
  electNewSteward,
  updateOnlineMembers,
  getCurrentSteward,
  getOnlineMembers,
  STEWARD_HEARTBEAT_TIMEOUT_MS,
} from "./steward-failover.js";

describe("Steward Failover", () => {
  describe("createStewardFailoverState", () => {
    it("should create state with current steward and timestamp", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      expect(getCurrentSteward(state)).toBe("steward-key-1");
      expect(getOnlineMembers(state)).toEqual([]);
    });
  });

  describe("recordStewardHeartbeat", () => {
    it("should update the last heartbeat timestamp", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      const updated = recordStewardHeartbeat(state, 2000);

      expect(isStewardOffline(updated, 2000)).toBe(false);
    });

    it("should keep steward online within timeout window", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);
      const updated = recordStewardHeartbeat(state, 1000);

      expect(
        isStewardOffline(updated, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS - 1),
      ).toBe(false);
    });
  });

  describe("isStewardOffline", () => {
    it("should detect steward offline after timeout", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      expect(
        isStewardOffline(state, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS + 1),
      ).toBe(true);
    });

    it("should detect steward online within timeout", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      expect(isStewardOffline(state, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS)).toBe(
        false,
      );
    });

    it("should detect steward offline exactly at timeout boundary", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      expect(
        isStewardOffline(state, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS + 1),
      ).toBe(true);
    });
  });

  describe("electNewSteward", () => {
    it("should elect the member with the lowest account public key", () => {
      const result = electNewSteward(["key-c", "key-a", "key-b"]);

      expect(result).toBe("key-a");
    });

    it("should handle a single candidate", () => {
      const result = electNewSteward(["key-only"]);

      expect(result).toBe("key-only");
    });

    it("should throw when no candidates are available", () => {
      expect(() => electNewSteward([])).toThrow("No candidates for steward election");
    });

    it("should produce deterministic results regardless of input order", () => {
      const result1 = electNewSteward(["key-z", "key-a", "key-m"]);
      const result2 = electNewSteward(["key-m", "key-z", "key-a"]);
      const result3 = electNewSteward(["key-a", "key-m", "key-z"]);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe("updateOnlineMembers", () => {
    it("should update the online members list", () => {
      const state = createStewardFailoverState("steward-key-1", 1000);

      const updated = updateOnlineMembers(state, ["member-a", "member-b"]);

      expect(getOnlineMembers(updated)).toEqual(["member-a", "member-b"]);
    });

    it("should replace previous online members", () => {
      let state = createStewardFailoverState("steward-key-1", 1000);
      state = updateOnlineMembers(state, ["member-a", "member-b"]);

      const updated = updateOnlineMembers(state, ["member-c"]);

      expect(getOnlineMembers(updated)).toEqual(["member-c"]);
    });
  });

  describe("immutability", () => {
    it("should not mutate the original state when recording heartbeat", () => {
      const original = createStewardFailoverState("steward-key-1", 1000);
      recordStewardHeartbeat(original, 2000);

      expect(
        isStewardOffline(original, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS + 1),
      ).toBe(true);
    });

    it("should not mutate the original state when updating online members", () => {
      const original = createStewardFailoverState("steward-key-1", 1000);
      updateOnlineMembers(original, ["member-a"]);

      expect(getOnlineMembers(original)).toEqual([]);
    });
  });
});

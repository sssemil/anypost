import { describe, it, expect } from "vitest";
import {
  serializeGroups,
  deserializeGroups,
  createDefaultPersistedData,
} from "./group-persistence.js";
import {
  createMultiGroupState,
  transitionMultiGroup,
} from "anypost-core/protocol";

describe("Group persistence", () => {
  describe("createDefaultPersistedData", () => {
    it("should return empty group data", () => {
      const data = createDefaultPersistedData();

      expect(data.joinedGroups).toEqual([]);
      expect(data.activeGroupId).toBeNull();
    });
  });

  describe("serializeGroups", () => {
    it("should serialize empty state", () => {
      const state = createMultiGroupState();
      const json = serializeGroups(state);
      const parsed = JSON.parse(json);

      expect(parsed.joinedGroups).toEqual([]);
      expect(parsed.activeGroupId).toBeNull();
    });

    it("should serialize state with groups", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const json = serializeGroups(state);
      const parsed = JSON.parse(json);

      expect(parsed.joinedGroups).toEqual(["group-1", "group-2"]);
      expect(parsed.activeGroupId).toBe("group-1");
    });
  });

  describe("deserializeGroups", () => {
    it("should round-trip through serialize/deserialize", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const json = serializeGroups(state);
      const data = deserializeGroups(json);

      expect(data.joinedGroups).toEqual(["group-1", "group-2"]);
      expect(data.activeGroupId).toBe("group-1");
    });

    it("should return default data for invalid JSON", () => {
      const data = deserializeGroups("not-json");

      expect(data.joinedGroups).toEqual([]);
      expect(data.activeGroupId).toBeNull();
    });

    it("should return default data for missing fields", () => {
      const data = deserializeGroups(JSON.stringify({ foo: "bar" }));

      expect(data.joinedGroups).toEqual([]);
      expect(data.activeGroupId).toBeNull();
    });

    it("should handle null activeGroupId", () => {
      const json = JSON.stringify({ joinedGroups: ["g1"], activeGroupId: null });
      const data = deserializeGroups(json);

      expect(data.joinedGroups).toEqual(["g1"]);
      expect(data.activeGroupId).toBeNull();
    });
  });
});

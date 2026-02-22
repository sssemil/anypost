import { describe, it, expect } from "vitest";
import type { ChatMessageEvent } from "anypost-core/protocol";
import {
  serializeGroups,
  deserializeGroups,
  createDefaultPersistedData,
} from "./group-persistence.js";
import {
  createMultiGroupState,
  transitionMultiGroup,
} from "anypost-core/protocol";

const createTestMessage = (
  overrides?: Partial<ChatMessageEvent>,
): ChatMessageEvent => ({
  id: crypto.randomUUID(),
  senderPeerId: "12D3KooWTestPeer",
  text: "hello",
  timestamp: Date.now(),
  ...overrides,
});

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

    it("should restore messages per group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      const msg = createTestMessage({ text: "persisted msg", senderPeerId: "peer-a" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: msg,
      });

      const json = serializeGroups(state);
      const data = deserializeGroups(json);

      expect(data.messages["group-1"]).toHaveLength(1);
      expect(data.messages["group-1"][0].text).toBe("persisted msg");
      expect(data.messages["group-1"][0].senderPeerId).toBe("peer-a");
    });

    it("should restore seenPeerIds per group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice" }),
      });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-bob" }),
      });

      const json = serializeGroups(state);
      const data = deserializeGroups(json);

      expect(data.seenPeerIds["group-1"]).toEqual(["peer-alice", "peer-bob"]);
    });

    it("should default to empty messages and seenPeerIds for legacy data", () => {
      const json = JSON.stringify({ joinedGroups: ["g1"], activeGroupId: "g1" });
      const data = deserializeGroups(json);

      expect(data.messages).toEqual({});
      expect(data.seenPeerIds).toEqual({});
    });
  });
});

import { describe, it, expect } from "vitest";
import type { ChatMessageEvent } from "./plaintext-chat.js";
import {
  createMultiGroupState,
  transitionMultiGroup,
  getActiveGroup,
  getActiveMessages,
  getGroupList,
  getSeenPeerIds,
  getGroupMembers,
  hasGroup,
} from "./multi-group-state.js";

const createTestMessage = (
  overrides?: Partial<ChatMessageEvent>,
): ChatMessageEvent => ({
  id: crypto.randomUUID(),
  senderPeerId: "12D3KooWTestPeer",
  text: "hello",
  timestamp: Date.now(),
  ...overrides,
});

describe("Multi-group state machine", () => {
  describe("createMultiGroupState", () => {
    it("should start with no groups and no active group", () => {
      const state = createMultiGroupState();

      expect(getGroupList(state)).toEqual([]);
      expect(getActiveGroup(state)).toBeNull();
      expect(state.activeGroupId).toBeNull();
    });
  });

  describe("joining a group", () => {
    it("should add the group and set it active when no group is selected", () => {
      const state = createMultiGroupState();

      const next = transitionMultiGroup(state, {
        type: "group-joined",
        groupId: "group-1",
      });

      expect(hasGroup(next, "group-1")).toBe(true);
      expect(next.activeGroupId).toBe("group-1");
      expect(getGroupList(next)).toHaveLength(1);
      expect(getGroupList(next)[0].groupId).toBe("group-1");
    });

    it("should add the group without changing active when one is already selected", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, {
        type: "group-joined",
        groupId: "group-1",
      });

      const next = transitionMultiGroup(state, {
        type: "group-joined",
        groupId: "group-2",
      });

      expect(hasGroup(next, "group-2")).toBe(true);
      expect(next.activeGroupId).toBe("group-1");
      expect(getGroupList(next)).toHaveLength(2);
    });

    it("should be a no-op for duplicate group joins", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, {
        type: "group-joined",
        groupId: "group-1",
      });

      const next = transitionMultiGroup(state, {
        type: "group-joined",
        groupId: "group-1",
      });

      expect(next).toBe(state);
    });

    it("should set the topic based on groupId", () => {
      const state = transitionMultiGroup(createMultiGroupState(), {
        type: "group-joined",
        groupId: "abc-123",
      });

      const group = getActiveGroup(state);
      expect(group?.topic).toBe("anypost/group/abc-123");
    });

    it("should preserve join order", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-a" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-b" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-c" });

      expect(state.joinOrder).toEqual(["group-a", "group-b", "group-c"]);
    });
  });

  describe("selecting a group", () => {
    it("should change the active group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const next = transitionMultiGroup(state, {
        type: "group-selected",
        groupId: "group-2",
      });

      expect(next.activeGroupId).toBe("group-2");
    });

    it("should clear unread count when selecting a group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-2",
        message: createTestMessage(),
      });

      const group2Before = state.groups.get("group-2");
      expect(group2Before?.unreadCount).toBe(1);

      const next = transitionMultiGroup(state, {
        type: "group-selected",
        groupId: "group-2",
      });

      const group2After = next.groups.get("group-2");
      expect(group2After?.unreadCount).toBe(0);
    });

    it("should be a no-op for unknown group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const next = transitionMultiGroup(state, {
        type: "group-selected",
        groupId: "nonexistent",
      });

      expect(next).toBe(state);
    });
  });

  describe("receiving messages", () => {
    it("should add message to the correct group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const msg = createTestMessage({ text: "hello world" });
      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: msg,
      });

      expect(getActiveMessages(next)).toEqual([msg]);
    });

    it("should increment unread count for non-active group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-2",
        message: createTestMessage(),
      });

      const group2 = next.groups.get("group-2");
      expect(group2?.unreadCount).toBe(1);
    });

    it("should not increment unread count for active group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage(),
      });

      const group1 = next.groups.get("group-1");
      expect(group1?.unreadCount).toBe(0);
    });

    it("should ignore messages for unknown groups", () => {
      const state = createMultiGroupState();

      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "nonexistent",
        message: createTestMessage(),
      });

      expect(next).toBe(state);
    });
  });

  describe("display name preservation", () => {
    it("should preserve senderDisplayName on received messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const msg = createTestMessage({
        text: "hello",
        senderDisplayName: "Alice",
      });
      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: msg,
      });

      const messages = getActiveMessages(next);
      expect(messages[0].senderDisplayName).toBe("Alice");
    });

    it("should preserve senderDisplayName on sent messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const msg = createTestMessage({
        text: "my message",
        senderDisplayName: "Bob",
      });
      const next = transitionMultiGroup(state, {
        type: "message-sent",
        groupId: "group-1",
        message: msg,
      });

      const messages = getActiveMessages(next);
      expect(messages[0].senderDisplayName).toBe("Bob");
    });

    it("should leave senderDisplayName undefined when not provided", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const msg = createTestMessage({ text: "no name" });
      const next = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: msg,
      });

      const messages = getActiveMessages(next);
      expect(messages[0].senderDisplayName).toBeUndefined();
    });
  });

  describe("sending messages", () => {
    it("should add sent message to the group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const msg = createTestMessage({ text: "my message" });
      const next = transitionMultiGroup(state, {
        type: "message-sent",
        groupId: "group-1",
        message: msg,
      });

      expect(getActiveMessages(next)).toEqual([msg]);
    });

    it("should not increment unread for sent messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const next = transitionMultiGroup(state, {
        type: "message-sent",
        groupId: "group-2",
        message: createTestMessage(),
      });

      const group2 = next.groups.get("group-2");
      expect(group2?.unreadCount).toBe(0);
    });
  });

  describe("leaving a group", () => {
    it("should remove the group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "group-1",
      });

      expect(hasGroup(next, "group-1")).toBe(false);
      expect(getGroupList(next)).toHaveLength(0);
    });

    it("should select the next group when leaving the active group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-3" });

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "group-1",
      });

      expect(next.activeGroupId).toBe("group-2");
    });

    it("should set active to null when leaving the last group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "group-1",
      });

      expect(next.activeGroupId).toBeNull();
    });

    it("should not change active when leaving a non-active group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "group-2",
      });

      expect(next.activeGroupId).toBe("group-1");
    });

    it("should be a no-op for unknown group", () => {
      const state = createMultiGroupState();

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "nonexistent",
      });

      expect(next).toBe(state);
    });

    it("should remove from join order", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-a" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-b" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-c" });

      const next = transitionMultiGroup(state, {
        type: "group-left",
        groupId: "group-b",
      });

      expect(next.joinOrder).toEqual(["group-a", "group-c"]);
    });
  });

  describe("helper functions", () => {
    it("getActiveGroup should return the active group entry", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const active = getActiveGroup(state);
      expect(active?.groupId).toBe("group-1");
      expect(active?.messages).toEqual([]);
      expect(active?.unreadCount).toBe(0);
    });

    it("getActiveMessages should return empty array when no active group", () => {
      const state = createMultiGroupState();

      expect(getActiveMessages(state)).toEqual([]);
    });

    it("getGroupList should return groups in join order", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-c" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-a" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-b" });

      const list = getGroupList(state);
      expect(list.map((g) => g.groupId)).toEqual(["group-c", "group-a", "group-b"]);
    });
  });

  describe("seen peer IDs per group", () => {
    it("should start with an empty set of seen peers", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      expect(getSeenPeerIds(state, "group-1")).toEqual(new Set());
    });

    it("should track sender peer ID from received messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice" }),
      });

      expect(getSeenPeerIds(state, "group-1")).toEqual(new Set(["peer-alice"]));
    });

    it("should track sender peer ID from sent messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      state = transitionMultiGroup(state, {
        type: "message-sent",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-self" }),
      });

      expect(getSeenPeerIds(state, "group-1")).toEqual(new Set(["peer-self"]));
    });

    it("should accumulate unique peer IDs across multiple messages", () => {
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
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice" }),
      });

      expect(getSeenPeerIds(state, "group-1")).toEqual(new Set(["peer-alice", "peer-bob"]));
    });

    it("should track peers independently per group", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-2" });

      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice" }),
      });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-2",
        message: createTestMessage({ senderPeerId: "peer-bob" }),
      });

      expect(getSeenPeerIds(state, "group-1")).toEqual(new Set(["peer-alice"]));
      expect(getSeenPeerIds(state, "group-2")).toEqual(new Set(["peer-bob"]));
    });

    it("should return empty set for unknown group", () => {
      const state = createMultiGroupState();

      expect(getSeenPeerIds(state, "nonexistent")).toEqual(new Set());
    });
  });

  describe("group members", () => {
    it("should return empty map for a group with no messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      expect(getGroupMembers(state, "group-1")).toEqual(new Map());
    });

    it("should map peer ID to display name from messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice", senderDisplayName: "Alice" }),
      });

      const members = getGroupMembers(state, "group-1");
      expect(members.get("peer-alice")).toBe("Alice");
    });

    it("should use the latest display name when a peer sends multiple messages", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice", senderDisplayName: "Alice" }),
      });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice", senderDisplayName: "Ali" }),
      });

      const members = getGroupMembers(state, "group-1");
      expect(members.get("peer-alice")).toBe("Ali");
    });

    it("should map peer ID to undefined when no display name provided", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-anon" }),
      });

      const members = getGroupMembers(state, "group-1");
      expect(members.has("peer-anon")).toBe(true);
      expect(members.get("peer-anon")).toBeUndefined();
    });

    it("should track multiple peers", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });
      state = transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-alice", senderDisplayName: "Alice" }),
      });
      state = transitionMultiGroup(state, {
        type: "message-sent",
        groupId: "group-1",
        message: createTestMessage({ senderPeerId: "peer-self", senderDisplayName: "Me" }),
      });

      const members = getGroupMembers(state, "group-1");
      expect(members.size).toBe(2);
      expect(members.get("peer-alice")).toBe("Alice");
      expect(members.get("peer-self")).toBe("Me");
    });

    it("should return empty map for unknown group", () => {
      const state = createMultiGroupState();

      expect(getGroupMembers(state, "nonexistent")).toEqual(new Map());
    });
  });

  describe("action chain groups", () => {
    it("should default hasActionChain to false for joined groups", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const group = getActiveGroup(state);
      expect(group?.hasActionChain).toBe(false);
    });

    it("should set hasActionChain to true for group-created events", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, {
        type: "group-created",
        groupId: "group-1",
        groupName: "My Group",
      });

      const group = getActiveGroup(state);
      expect(group?.hasActionChain).toBe(true);
      expect(group?.groupName).toBe("My Group");
    });

    it("should preserve groupName on action chain groups", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, {
        type: "group-created",
        groupId: "group-1",
        groupName: "Test Group",
      });

      const list = getGroupList(state);
      expect(list[0].groupName).toBe("Test Group");
    });
  });

  describe("immutability", () => {
    it("should not mutate the original state on join", () => {
      const original = createMultiGroupState();
      transitionMultiGroup(original, { type: "group-joined", groupId: "group-1" });

      expect(getGroupList(original)).toEqual([]);
      expect(original.activeGroupId).toBeNull();
    });

    it("should not mutate the original state on message received", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      const before = getActiveMessages(state);
      transitionMultiGroup(state, {
        type: "message-received",
        groupId: "group-1",
        message: createTestMessage(),
      });

      expect(getActiveMessages(state)).toBe(before);
    });

    it("should not mutate the original state on leave", () => {
      let state = createMultiGroupState();
      state = transitionMultiGroup(state, { type: "group-joined", groupId: "group-1" });

      transitionMultiGroup(state, { type: "group-left", groupId: "group-1" });

      expect(hasGroup(state, "group-1")).toBe(true);
    });
  });
});

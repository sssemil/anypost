import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  createGroupDocument,
  appendMessage,
  getChannelMessages,
  setGroupMetadata,
  getGroupMetadata,
  addMember,
  removeMember,
  getMembers,
  addChannel,
  getChannels,
  createChannelInGroup,
  deleteChannel,
  storePendingWelcome,
  getPendingWelcome,
  removePendingWelcome,
} from "./group-document.js";
import {
  createGroupMetadata,
  createMember,
  createChannel,
  createMessageRef,
} from "../shared/factories.js";

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const TEST_ACCOUNT_KEY = "ed25519:testkey123";

describe("Group Document", () => {
  describe("createGroupDocument", () => {
    it("should return a Y.Doc with correct guid", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      expect(doc).toBeInstanceOf(Y.Doc);
      expect(doc.guid).toBe(TEST_GROUP_ID);
    });
  });

  describe("group metadata", () => {
    it("should store metadata in Y.Map via setGroupMetadata", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const metadata = createGroupMetadata();

      setGroupMetadata(doc, metadata);

      const result = getGroupMetadata(doc);
      expect(result).toEqual(metadata);
    });

    it("should return null for unset metadata via getGroupMetadata", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      const result = getGroupMetadata(doc);

      expect(result).toBeNull();
    });

    it("should parse metadata via GroupMetadataSchema", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      setGroupMetadata(doc, createGroupMetadata({ name: "Valid Name" }));

      const result = getGroupMetadata(doc);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Valid Name");
    });

    it("should return null when metadata in Y.Map fails schema validation", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const metadataMap = doc.getMap("metadata");
      metadataMap.set("name", "");
      metadataMap.set("description", "A test group");
      metadataMap.set("createdAt", 1700000000000);
      metadataMap.set("stewardPeerId", "12D3KooWTestPeer");

      const result = getGroupMetadata(doc);

      expect(result).toBeNull();
    });
  });

  describe("members", () => {
    it("should add member to members Y.Map", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const member = createMember();

      addMember(doc, member);

      const members = getMembers(doc);
      expect(members.length).toBe(1);
      expect(members[0]).toEqual(member);
    });

    it("should remove member from members Y.Map", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      addMember(doc, createMember());

      removeMember(doc, TEST_ACCOUNT_KEY);

      const members = getMembers(doc);
      expect(members.length).toBe(0);
    });

    it("should return all members for a group", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      addMember(doc, createMember({ accountPublicKey: "key1" }));
      addMember(doc, createMember({ accountPublicKey: "key2", role: "admin" }));
      addMember(doc, createMember({ accountPublicKey: "key3", role: "owner" }));

      const members = getMembers(doc);

      expect(members.length).toBe(3);
    });

    it("should exclude members with invalid shape from getMembers", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const membersMap = doc.getMap("members");
      membersMap.set("key1", { accountPublicKey: "key1", role: "member", joinedAt: 100 });
      membersMap.set("key2", { garbage: true });

      const members = getMembers(doc);

      expect(members.length).toBe(1);
      expect(members[0].accountPublicKey).toBe("key1");
    });
  });

  describe("channels", () => {
    it("should append channel to channels Y.Array", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const channel = createChannel();

      addChannel(doc, channel);

      const channels = getChannels(doc);
      expect(channels.length).toBe(1);
      expect(channels[0]).toEqual(channel);
    });

    it("should assign incrementing sort order implicitly via multiple adds", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      addChannel(doc, createChannel({ id: "c1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01", sortOrder: 0 }));
      addChannel(doc, createChannel({ id: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02", sortOrder: 1 }));

      const channels = getChannels(doc);
      expect(channels.length).toBe(2);
      expect(channels[0].id).toBe("c1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01");
      expect(channels[1].id).toBe("c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02");
    });

    it("should auto-assign sort order when creating a channel", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      createChannelInGroup(doc, { name: "general", type: "text" });
      createChannelInGroup(doc, { name: "random", type: "text" });
      createChannelInGroup(doc, { name: "voice-lobby", type: "voice" });

      const channels = getChannels(doc);
      expect(channels).toHaveLength(3);
      expect(channels[0].sortOrder).toBe(0);
      expect(channels[1].sortOrder).toBe(1);
      expect(channels[2].sortOrder).toBe(2);
      expect(channels[2].type).toBe("voice");
    });

    it("should assign non-colliding sort order after a channel is deleted", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      createChannelInGroup(doc, { name: "general", type: "text" });
      createChannelInGroup(doc, { name: "random", type: "text" });
      const before = getChannels(doc);
      deleteChannel(doc, before[0].id);

      createChannelInGroup(doc, { name: "announcements", type: "text" });

      const channels = getChannels(doc);
      const sortOrders = channels.map((ch) => ch.sortOrder);
      const uniqueSortOrders = new Set(sortOrders);
      expect(uniqueSortOrders.size).toBe(sortOrders.length);
    });

    it("should delete a channel and its messages", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const channelId = "c1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01";

      addChannel(doc, createChannel({ id: channelId, name: "to-delete", sortOrder: 0 }));
      appendMessage(doc, channelId, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01" }));
      appendMessage(doc, channelId, createMessageRef({ id: "d2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02" }));

      deleteChannel(doc, channelId);

      expect(getChannels(doc)).toHaveLength(0);
      expect(getChannelMessages(doc, channelId)).toHaveLength(0);
    });

    it("should only delete the specified channel", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const keepId = "c1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01";
      const deleteId = "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02";

      addChannel(doc, createChannel({ id: keepId, name: "keep", sortOrder: 0 }));
      addChannel(doc, createChannel({ id: deleteId, name: "remove", sortOrder: 1 }));
      appendMessage(doc, keepId, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01" }));

      deleteChannel(doc, deleteId);

      expect(getChannels(doc)).toHaveLength(1);
      expect(getChannels(doc)[0].id).toBe(keepId);
      expect(getChannelMessages(doc, keepId)).toHaveLength(1);
    });
  });

  describe("messages", () => {
    it("should add message to channel's Y.Array", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const msg = createMessageRef();

      appendMessage(doc, TEST_CHANNEL_ID, msg);

      const messages = getChannelMessages(doc, TEST_CHANNEL_ID);
      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(msg);
    });

    it("should create channel array if it doesn't exist", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const newChannelId = "d3ffbc99-9c0b-4ef8-bb6d-6bb9bd380a44";

      appendMessage(doc, newChannelId, createMessageRef());

      const messages = getChannelMessages(doc, newChannelId);
      expect(messages.length).toBe(1);
    });

    it("should return all messages for a channel", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      appendMessage(doc, TEST_CHANNEL_ID, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01" }));
      appendMessage(doc, TEST_CHANNEL_ID, createMessageRef({ id: "d2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02" }));
      appendMessage(doc, TEST_CHANNEL_ID, createMessageRef({ id: "d3ffbc99-9c0b-4ef8-bb6d-6bb9bd380a03" }));

      const messages = getChannelMessages(doc, TEST_CHANNEL_ID);

      expect(messages.length).toBe(3);
      expect(messages[0].id).toBe("d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01");
      expect(messages[2].id).toBe("d3ffbc99-9c0b-4ef8-bb6d-6bb9bd380a03");
    });

    it("should return empty array for unknown channel", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      const messages = getChannelMessages(doc, "e4ffbc99-9c0b-4ef8-bb6d-6bb9bd380a55");

      expect(messages).toEqual([]);
    });

    it("should exclude malformed messages from getChannelMessages", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const arr = doc.getArray(`messages:${TEST_CHANNEL_ID}`);
      arr.push([
        { id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01", senderPeerId: "peer1", timestamp: 1000 },
        { not: "a message" },
      ]);

      const messages = getChannelMessages(doc, TEST_CHANNEL_ID);

      expect(messages.length).toBe(1);
    });
  });

  describe("pending welcomes", () => {
    it("should store pending welcome message in group doc", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      const welcomeData = new Uint8Array([1, 2, 3, 4]);

      storePendingWelcome(doc, "ed25519:invitee-key", welcomeData);

      const retrieved = getPendingWelcome(doc, "ed25519:invitee-key");
      expect(retrieved).toEqual(welcomeData);
    });

    it("should return null for unknown account key", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);

      const result = getPendingWelcome(doc, "ed25519:unknown-key");

      expect(result).toBeNull();
    });

    it("should remove pending welcome after removal", () => {
      const doc = createGroupDocument(TEST_GROUP_ID);
      storePendingWelcome(doc, "ed25519:invitee-key", new Uint8Array([5, 6]));

      removePendingWelcome(doc, "ed25519:invitee-key");

      expect(getPendingWelcome(doc, "ed25519:invitee-key")).toBeNull();
    });

    it("should merge pending welcomes across Y.Docs via CRDT", () => {
      const doc1 = createGroupDocument(TEST_GROUP_ID);
      const doc2 = createGroupDocument(TEST_GROUP_ID);

      storePendingWelcome(doc1, "ed25519:invitee1", new Uint8Array([10, 20]));

      const update = Y.encodeStateAsUpdate(doc1);
      Y.applyUpdate(doc2, update);

      const retrieved = getPendingWelcome(doc2, "ed25519:invitee1");
      expect(retrieved).toEqual(new Uint8Array([10, 20]));
    });
  });

  describe("CRDT merging", () => {
    it("should merge two Y.Docs via Yjs sync protocol", () => {
      const doc1 = createGroupDocument(TEST_GROUP_ID);
      const doc2 = createGroupDocument(TEST_GROUP_ID);

      setGroupMetadata(doc1, createGroupMetadata({ name: "Group 1" }));
      addMember(doc2, createMember());

      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc2, update1);
      Y.applyUpdate(doc1, update2);

      const metadata1 = getGroupMetadata(doc1);
      const metadata2 = getGroupMetadata(doc2);
      expect(metadata1).toEqual(metadata2);
      expect(metadata1?.name).toBe("Group 1");

      const members1 = getMembers(doc1);
      const members2 = getMembers(doc2);
      expect(members1).toEqual(members2);
      expect(members1.length).toBe(1);
    });

    it("should merge concurrent appends to same channel deterministically", () => {
      const doc1 = createGroupDocument(TEST_GROUP_ID);
      const doc2 = createGroupDocument(TEST_GROUP_ID);

      appendMessage(doc1, TEST_CHANNEL_ID, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01", timestamp: 1000 }));
      appendMessage(doc2, TEST_CHANNEL_ID, createMessageRef({ id: "d2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02", timestamp: 2000 }));

      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc2, update1);
      Y.applyUpdate(doc1, update2);

      const messages1 = getChannelMessages(doc1, TEST_CHANNEL_ID);
      const messages2 = getChannelMessages(doc2, TEST_CHANNEL_ID);

      expect(messages1.length).toBe(2);
      expect(messages2.length).toBe(2);
      expect(messages1.map((m) => m.id)).toEqual(messages2.map((m) => m.id));
    });
  });
});

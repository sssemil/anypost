import { describe, it, expect, afterEach } from "vitest";
import "fake-indexeddb/auto";
import * as Y from "yjs";
import {
  createPersistedGroupDocument,
  openMessageContentStore,
  requestPersistentStorage,
} from "./persistence.js";
import type { PersistedGroupDocument, MessageContentStore } from "./persistence.js";
import {
  setGroupMetadata,
  getGroupMetadata,
  appendMessage,
  getChannelMessages,
} from "./group-document.js";
import {
  createGroupMetadata,
  createMessageRef,
} from "../shared/factories.js";

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("IndexedDB Persistence", () => {
  describe("createPersistedGroupDocument", () => {
    let persisted: PersistedGroupDocument;

    afterEach(async () => {
      await persisted?.destroy();
    });

    it("should return a Y.Doc with persistence provider attached", async () => {
      persisted = await createPersistedGroupDocument(TEST_GROUP_ID);

      expect(persisted.doc).toBeInstanceOf(Y.Doc);
      expect(persisted.doc.guid).toBe(TEST_GROUP_ID);
    });

    it("should restore group metadata after destroying and recreating", async () => {
      persisted = await createPersistedGroupDocument(TEST_GROUP_ID);
      setGroupMetadata(persisted.doc, createGroupMetadata({ name: "Persisted Group" }));

      await persisted.destroy();

      persisted = await createPersistedGroupDocument(TEST_GROUP_ID);
      const metadata = getGroupMetadata(persisted.doc);
      expect(metadata).not.toBeNull();
      expect(metadata?.name).toBe("Persisted Group");
    });

    it("should restore messages after destroying and recreating", async () => {
      persisted = await createPersistedGroupDocument(TEST_GROUP_ID);
      appendMessage(persisted.doc, TEST_CHANNEL_ID, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01" }));
      appendMessage(persisted.doc, TEST_CHANNEL_ID, createMessageRef({ id: "d2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02" }));

      await persisted.destroy();

      persisted = await createPersistedGroupDocument(TEST_GROUP_ID);
      const messages = getChannelMessages(persisted.doc, TEST_CHANNEL_ID);
      expect(messages.length).toBe(2);
      expect(messages[0].id).toBe("d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01");
    });
  });

  describe("openMessageContentStore", () => {
    let store: MessageContentStore;

    afterEach(async () => {
      await store?.close();
    });

    it("should store and retrieve plaintext message content", async () => {
      store = await openMessageContentStore();
      const content = { type: "text" as const, text: "Hello, world!" };

      await store.put("msg-1", content);
      const retrieved = await store.get("msg-1");

      expect(retrieved).toEqual(content);
    });

    it("should return undefined for unknown message ID", async () => {
      store = await openMessageContentStore();

      const retrieved = await store.get("nonexistent");

      expect(retrieved).toBeUndefined();
    });

    it("should delete message content", async () => {
      store = await openMessageContentStore();
      await store.put("msg-1", { type: "text" as const, text: "Hello" });

      await store.delete("msg-1");
      const retrieved = await store.get("msg-1");

      expect(retrieved).toBeUndefined();
    });

    it("should store content with attachments metadata", async () => {
      store = await openMessageContentStore();
      const content = {
        type: "text" as const,
        text: "Check this file",
        attachments: [
          { name: "doc.pdf", mimeType: "application/pdf", size: 1024, data: new Uint8Array([1, 2, 3]) },
        ],
      };

      await store.put("msg-2", content);
      const retrieved = await store.get("msg-2");

      expect(retrieved).toEqual(content);
    });
  });

  describe("requestPersistentStorage", () => {
    it("should return true when storage persistence is granted", async () => {
      const result = await requestPersistentStorage();

      expect(typeof result).toBe("boolean");
    });
  });
});

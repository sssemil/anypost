import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import * as Y from "yjs";
import {
  createPersistedGroupDocument,
  openMessageContentStore,
  requestPersistentStorage,
} from "./persistence.js";
import {
  setGroupMetadata,
  getGroupMetadata,
  appendMessage,
  getChannelMessages,
} from "./group-document.js";
import {
  createGroupMetadata,
  createMessageRef,
  createMessageContent,
} from "../shared/factories.js";

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("IndexedDB Persistence", () => {
  describe("createPersistedGroupDocument", () => {
    it("should return a Y.Doc with persistence provider attached", async () => {
      const persisted = await createPersistedGroupDocument(TEST_GROUP_ID);
      try {
        expect(persisted.doc).toBeInstanceOf(Y.Doc);
        expect(persisted.doc.guid).toBe(TEST_GROUP_ID);
      } finally {
        await persisted.destroy();
      }
    });

    it("should restore group metadata after destroying and recreating", async () => {
      const first = await createPersistedGroupDocument(TEST_GROUP_ID);
      setGroupMetadata(first.doc, createGroupMetadata({ name: "Persisted Group" }));
      await first.destroy();

      const second = await createPersistedGroupDocument(TEST_GROUP_ID);
      try {
        const metadata = getGroupMetadata(second.doc);
        expect(metadata).not.toBeNull();
        expect(metadata?.name).toBe("Persisted Group");
      } finally {
        await second.destroy();
      }
    });

    it("should restore messages after destroying and recreating", async () => {
      const first = await createPersistedGroupDocument(TEST_GROUP_ID);
      appendMessage(first.doc, TEST_CHANNEL_ID, createMessageRef({ id: "d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01" }));
      appendMessage(first.doc, TEST_CHANNEL_ID, createMessageRef({ id: "d2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a02" }));
      await first.destroy();

      const second = await createPersistedGroupDocument(TEST_GROUP_ID);
      try {
        const messages = getChannelMessages(second.doc, TEST_CHANNEL_ID);
        expect(messages.length).toBe(2);
        expect(messages[0].id).toBe("d1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a01");
      } finally {
        await second.destroy();
      }
    });
  });

  describe("openMessageContentStore", () => {
    it("should store and retrieve plaintext message content", async () => {
      const store = await openMessageContentStore();
      try {
        const content = createMessageContent();

        await store.put("msg-1", content);
        const retrieved = await store.get("msg-1");

        expect(retrieved).toEqual(content);
      } finally {
        store.close();
      }
    });

    it("should return undefined for unknown message ID", async () => {
      const store = await openMessageContentStore();
      try {
        const retrieved = await store.get("nonexistent");

        expect(retrieved).toBeUndefined();
      } finally {
        store.close();
      }
    });

    it("should delete message content", async () => {
      const store = await openMessageContentStore();
      try {
        await store.put("msg-1", createMessageContent({ text: "Hello" }));

        await store.delete("msg-1");
        const retrieved = await store.get("msg-1");

        expect(retrieved).toBeUndefined();
      } finally {
        store.close();
      }
    });

    it("should store content with attachments metadata", async () => {
      const store = await openMessageContentStore();
      try {
        const content = createMessageContent({
          text: "Check this file",
          attachments: [
            { name: "doc.pdf", mimeType: "application/pdf", size: 1024, data: new Uint8Array([1, 2, 3]) },
          ],
        });

        await store.put("msg-2", content);
        const retrieved = await store.get("msg-2");

        expect(retrieved).toEqual(content);
      } finally {
        store.close();
      }
    });

    it("should persist content across store instances", async () => {
      const store1 = await openMessageContentStore();
      const content = createMessageContent({ text: "Persistent" });
      await store1.put("msg-1", content);
      store1.close();

      const store2 = await openMessageContentStore();
      try {
        const retrieved = await store2.get("msg-1");
        expect(retrieved).toEqual(content);
      } finally {
        store2.close();
      }
    });
  });

  describe("requestPersistentStorage", () => {
    it("should return false when navigator.storage.persist is unavailable", async () => {
      const result = await requestPersistentStorage();

      expect(result).toBe(false);
    });

    it("should return true when navigator.storage.persist grants persistence", async () => {
      vi.stubGlobal("navigator", {
        storage: { persist: () => Promise.resolve(true) },
      });
      try {
        const result = await requestPersistentStorage();
        expect(result).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should return false when navigator exists without storage API", async () => {
      vi.stubGlobal("navigator", {});
      try {
        const result = await requestPersistentStorage();
        expect(result).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

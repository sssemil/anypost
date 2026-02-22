import type * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import { createGroupDocument } from "./group-document.js";
import { createSettingsDocument } from "./settings-document.js";
import type { GroupId, MessageContent } from "../shared/schemas.js";

export type PersistedGroupDocument = {
  readonly doc: Y.Doc;
  readonly destroy: () => Promise<void>;
};

export const createPersistedGroupDocument = async (
  groupId: GroupId,
): Promise<PersistedGroupDocument> => {
  const doc = createGroupDocument(groupId);
  const persistence = new IndexeddbPersistence(`anypost:group:${groupId}`, doc);

  await persistence.whenSynced;

  return {
    doc,
    destroy: async () => {
      await persistence.destroy();
      doc.destroy();
    },
  };
};

export type PersistedSettingsDocument = {
  readonly doc: Y.Doc;
  readonly destroy: () => Promise<void>;
};

export const createPersistedSettingsDocument = async (
  accountPublicKey: Uint8Array,
): Promise<PersistedSettingsDocument> => {
  const doc = createSettingsDocument(accountPublicKey);
  const persistence = new IndexeddbPersistence(`anypost:${doc.guid}`, doc);

  await persistence.whenSynced;

  return {
    doc,
    destroy: async () => {
      await persistence.destroy();
      doc.destroy();
    },
  };
};

type MessageContentDBSchema = {
  messages: {
    key: string;
    value: MessageContent;
  };
};

export type MessageContentStore = {
  readonly put: (messageId: string, content: MessageContent) => Promise<void>;
  readonly get: (messageId: string) => Promise<MessageContent | undefined>;
  readonly delete: (messageId: string) => Promise<void>;
  readonly close: () => void;
};

export const openMessageContentStore = async (): Promise<MessageContentStore> => {
  const db: IDBPDatabase<MessageContentDBSchema> = await openDB<MessageContentDBSchema>(
    "anypost:message-content",
    1,
    {
      upgrade(database) {
        database.createObjectStore("messages");
      },
    },
  );

  return {
    put: async (messageId: string, content: MessageContent) => {
      await db.put("messages", content, messageId);
    },
    get: async (messageId: string) => {
      return db.get("messages", messageId);
    },
    delete: async (messageId: string) => {
      await db.delete("messages", messageId);
    },
    close: () => {
      db.close();
    },
  };
};

type StorageManager = { persist: () => Promise<boolean> };
type NavigatorWithStorage = { storage?: StorageManager };

export const requestPersistentStorage = async (): Promise<boolean> => {
  const nav: NavigatorWithStorage | undefined =
    typeof navigator !== "undefined" ? (navigator as unknown as NavigatorWithStorage) : undefined;
  if (nav?.storage?.persist) {
    return nav.storage.persist();
  }
  return false;
};

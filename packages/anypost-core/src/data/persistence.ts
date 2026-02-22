import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import { createGroupDocument } from "./group-document.js";
import type { GroupId } from "../shared/schemas.js";
import type { MessageContent } from "../shared/schemas.js";

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

export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator !== "undefined") {
    const nav = navigator as { storage?: { persist?: () => Promise<boolean> } };
    if (nav.storage?.persist) {
      return nav.storage.persist();
    }
  }
  return false;
};

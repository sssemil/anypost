import { openDB, deleteDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { AccountKey } from "../crypto/identity.js";

const DB_NAME = "anypost:account";

type AccountStoreDBSchema = {
  account: {
    key: string;
    value: Uint8Array | boolean;
  };
};

export type AccountStore = {
  readonly getAccountKey: () => Promise<AccountKey | null>;
  readonly saveAccountKey: (key: AccountKey) => Promise<void>;
  readonly hasAccountKey: () => Promise<boolean>;
  readonly deleteAccountKey: () => Promise<void>;
  readonly isBackedUp: () => Promise<boolean>;
  readonly setBackedUp: (backedUp: boolean) => Promise<void>;
  readonly destroy: () => Promise<void>;
  readonly close: () => void;
};

export const openAccountStore = async (): Promise<AccountStore> => {
  const db: IDBPDatabase<AccountStoreDBSchema> = await openDB<AccountStoreDBSchema>(
    DB_NAME,
    1,
    {
      upgrade(database) {
        database.createObjectStore("account");
      },
    },
  );

  return {
    getAccountKey: async () => {
      const publicKey = await db.get("account", "publicKey");
      const privateKey = await db.get("account", "privateKey");
      if (!publicKey || !privateKey) return null;
      return {
        publicKey: publicKey as Uint8Array,
        privateKey: privateKey as Uint8Array,
      };
    },

    saveAccountKey: async (key: AccountKey) => {
      await db.put("account", new Uint8Array(key.publicKey), "publicKey");
      await db.put("account", new Uint8Array(key.privateKey), "privateKey");
    },

    hasAccountKey: async () => {
      const publicKey = await db.get("account", "publicKey");
      return publicKey !== undefined;
    },

    deleteAccountKey: async () => {
      await db.delete("account", "publicKey");
      await db.delete("account", "privateKey");
    },

    isBackedUp: async () => {
      const status = await db.get("account", "backedUp");
      return status === true;
    },

    setBackedUp: async (backedUp: boolean) => {
      await db.put("account", backedUp, "backedUp");
    },

    destroy: async () => {
      db.close();
      await deleteDB(DB_NAME);
    },

    close: () => {
      db.close();
    },
  };
};

import { openDB, deleteDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { AccountKey } from "../crypto/identity.js";

const DB_NAME = "anypost:account";

type AccountStoreDBSchema = {
  account: {
    key: string;
    value: Uint8Array | boolean | string;
  };
};

const PEER_PATH_CACHE_KEY = "peerPathCache";

const decodePeerPathCache = (value: string): ReadonlyMap<string, readonly string[]> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map();

    const cache = new Map<string, readonly string[]>();
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [peerId, paths] = entry;
      if (typeof peerId !== "string" || !Array.isArray(paths)) continue;
      const validPaths = paths.filter((path): path is string => typeof path === "string");
      if (validPaths.length === 0) continue;
      cache.set(peerId, validPaths);
    }
    return cache;
  } catch {
    return new Map();
  }
};

const encodePeerPathCache = (
  cache: ReadonlyMap<string, readonly string[]>,
): string => JSON.stringify([...cache.entries()].map(([peerId, paths]) => [peerId, [...paths]]));

export type AccountStore = {
  readonly getAccountKey: () => Promise<AccountKey | null>;
  readonly saveAccountKey: (key: AccountKey) => Promise<void>;
  readonly hasAccountKey: () => Promise<boolean>;
  readonly deleteAccountKey: () => Promise<void>;
  readonly isBackedUp: () => Promise<boolean>;
  readonly setBackedUp: (backedUp: boolean) => Promise<void>;
  readonly getPeerPrivateKey: () => Promise<Uint8Array | null>;
  readonly savePeerPrivateKey: (key: Uint8Array) => Promise<void>;
  readonly getPeerPathCache: () => Promise<ReadonlyMap<string, readonly string[]>>;
  readonly savePeerPathCache: (cache: ReadonlyMap<string, readonly string[]>) => Promise<void>;
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
      if (!(publicKey instanceof Uint8Array) || !(privateKey instanceof Uint8Array)) {
        return null;
      }
      return { publicKey, privateKey };
    },

    saveAccountKey: async (key: AccountKey) => {
      const tx = db.transaction("account", "readwrite");
      const store = tx.objectStore("account");
      store.put(new Uint8Array(key.publicKey), "publicKey");
      store.put(new Uint8Array(key.privateKey), "privateKey");
      await tx.done;
    },

    hasAccountKey: async () => {
      const publicKey = await db.get("account", "publicKey");
      const privateKey = await db.get("account", "privateKey");
      return publicKey instanceof Uint8Array && privateKey instanceof Uint8Array;
    },

    deleteAccountKey: async () => {
      const tx = db.transaction("account", "readwrite");
      const store = tx.objectStore("account");
      store.delete("publicKey");
      store.delete("privateKey");
      await tx.done;
    },

    isBackedUp: async () => {
      const status = await db.get("account", "backedUp");
      return status === true;
    },

    setBackedUp: async (backedUp: boolean) => {
      await db.put("account", backedUp, "backedUp");
    },

    getPeerPrivateKey: async () => {
      const key = await db.get("account", "peerPrivateKey");
      if (!(key instanceof Uint8Array)) return null;
      return key;
    },

    savePeerPrivateKey: async (key: Uint8Array) => {
      await db.put("account", new Uint8Array(key), "peerPrivateKey");
    },

    getPeerPathCache: async () => {
      const value = await db.get("account", PEER_PATH_CACHE_KEY);
      if (typeof value !== "string") return new Map();
      return decodePeerPathCache(value);
    },

    savePeerPathCache: async (cache: ReadonlyMap<string, readonly string[]>) => {
      await db.put("account", encodePeerPathCache(cache), PEER_PATH_CACHE_KEY);
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

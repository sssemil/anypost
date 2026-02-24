import { openDB, deleteDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { AccountKey } from "../crypto/identity.js";
import type { JoinRetryEntry, JoinRetryState, JoinRetryStatus } from "../protocol/join-retry-queue.js";
import type { SyncPeerProgress, SyncProgressState } from "../protocol/multi-group-chat.js";

const DB_NAME = "anypost:account";

type AccountStoreDBSchema = {
  account: {
    key: string;
    value: Uint8Array | boolean | string;
  };
};

const PEER_PATH_CACHE_KEY = "peerPathCache";
const JOIN_RETRY_STATE_KEY = "joinRetryState";
const SYNC_PROGRESS_STATE_KEY = "syncProgressState";
const CONTACTS_BOOK_KEY = "contactsBook";
const BLOCKED_PEERS_KEY = "blockedPeers";

export type ContactBookEntry = {
  readonly peerId: string;
  readonly nickname: string | null;
  readonly selfName: string | null;
  readonly seenSelfNames: readonly string[];
  readonly lastSeenAt: number;
  readonly groupIds: readonly string[];
};

export type ContactsBook = ReadonlyMap<string, ContactBookEntry>;

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

const isJoinRetryStatus = (value: unknown): value is JoinRetryStatus =>
  value === "active" || value === "paused" || value === "cancelled";

const decodeJoinRetryState = (value: string): JoinRetryState => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map();

    const state = new Map<string, JoinRetryEntry>();
    for (const rawEntry of parsed) {
      if (!Array.isArray(rawEntry) || rawEntry.length !== 2) continue;
      const [groupId, rawValue] = rawEntry;
      if (typeof groupId !== "string" || typeof rawValue !== "object" || rawValue === null) continue;

      const valueObj = rawValue as Record<string, unknown>;
      const createdAt = valueObj.createdAt;
      const lastAttemptAt = valueObj.lastAttemptAt;
      const nextAttemptAt = valueObj.nextAttemptAt;
      const attemptCount = valueObj.attemptCount;
      const status = valueObj.status;

      if (
        typeof createdAt !== "number" ||
        !Number.isFinite(createdAt) ||
        !(lastAttemptAt === null || (typeof lastAttemptAt === "number" && Number.isFinite(lastAttemptAt))) ||
        typeof nextAttemptAt !== "number" ||
        !Number.isFinite(nextAttemptAt) ||
        typeof attemptCount !== "number" ||
        !Number.isInteger(attemptCount) ||
        attemptCount < 0 ||
        !isJoinRetryStatus(status)
      ) {
        continue;
      }

      state.set(groupId, {
        groupId,
        createdAt,
        lastAttemptAt,
        nextAttemptAt,
        attemptCount,
        status,
      });
    }
    return state;
  } catch {
    return new Map();
  }
};

const encodeJoinRetryState = (state: JoinRetryState): string =>
  JSON.stringify([...state.entries()].map(([groupId, entry]) => [groupId, {
    groupId: entry.groupId,
    createdAt: entry.createdAt,
    lastAttemptAt: entry.lastAttemptAt,
    nextAttemptAt: entry.nextAttemptAt,
    attemptCount: entry.attemptCount,
    status: entry.status,
  }]));

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const decodeSyncProgressState = (value: string): SyncProgressState => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map();

    const byGroup = new Map<string, ReadonlyMap<string, SyncPeerProgress>>();
    for (const rawGroupEntry of parsed) {
      if (!Array.isArray(rawGroupEntry) || rawGroupEntry.length !== 2) continue;
      const [groupId, rawPeerEntries] = rawGroupEntry;
      if (typeof groupId !== "string" || !Array.isArray(rawPeerEntries)) continue;

      const byPeer = new Map<string, SyncPeerProgress>();
      for (const rawPeerEntry of rawPeerEntries) {
        if (!Array.isArray(rawPeerEntry) || rawPeerEntry.length !== 2) continue;
        const [peerId, rawProgress] = rawPeerEntry;
        if (typeof peerId !== "string" || typeof rawProgress !== "object" || rawProgress === null) continue;

        const progressObj = rawProgress as Record<string, unknown>;
        const lastServedEnvelopeCount = progressObj.lastServedEnvelopeCount;
        const lastReceivedEnvelopeCount = progressObj.lastReceivedEnvelopeCount;
        if (
          !isNullableFiniteNumber(progressObj.lastRequestedAtMs) ||
          !isNullableString(progressObj.lastRequestKnownHashHex) ||
          !isNullableFiniteNumber(progressObj.lastServedAtMs) ||
          !isNullableString(progressObj.lastServedKnownHashHex) ||
          !isNullableString(progressObj.lastServedHeadHashHex) ||
          typeof lastServedEnvelopeCount !== "number" ||
          !Number.isInteger(lastServedEnvelopeCount) ||
          lastServedEnvelopeCount < 0 ||
          !isNullableFiniteNumber(progressObj.lastReceivedAtMs) ||
          !isNullableString(progressObj.lastReceivedHashHex) ||
          typeof lastReceivedEnvelopeCount !== "number" ||
          !Number.isInteger(lastReceivedEnvelopeCount) ||
          lastReceivedEnvelopeCount < 0
        ) {
          continue;
        }

        byPeer.set(peerId, {
          lastRequestedAtMs: progressObj.lastRequestedAtMs,
          lastRequestKnownHashHex: progressObj.lastRequestKnownHashHex,
          lastServedAtMs: progressObj.lastServedAtMs,
          lastServedKnownHashHex: progressObj.lastServedKnownHashHex,
          lastServedHeadHashHex: progressObj.lastServedHeadHashHex,
          lastServedEnvelopeCount,
          lastReceivedAtMs: progressObj.lastReceivedAtMs,
          lastReceivedHashHex: progressObj.lastReceivedHashHex,
          lastReceivedEnvelopeCount,
        });
      }

      if (byPeer.size > 0) {
        byGroup.set(groupId, byPeer);
      }
    }

    return byGroup;
  } catch {
    return new Map();
  }
};

const encodeSyncProgressState = (state: SyncProgressState): string =>
  JSON.stringify([...state.entries()].map(([groupId, peerMap]) => [
    groupId,
    [...peerMap.entries()].map(([peerId, progress]) => [
      peerId,
      {
        lastRequestedAtMs: progress.lastRequestedAtMs,
        lastRequestKnownHashHex: progress.lastRequestKnownHashHex,
        lastServedAtMs: progress.lastServedAtMs,
        lastServedKnownHashHex: progress.lastServedKnownHashHex,
        lastServedHeadHashHex: progress.lastServedHeadHashHex,
        lastServedEnvelopeCount: progress.lastServedEnvelopeCount,
        lastReceivedAtMs: progress.lastReceivedAtMs,
        lastReceivedHashHex: progress.lastReceivedHashHex,
        lastReceivedEnvelopeCount: progress.lastReceivedEnvelopeCount,
      },
    ]),
  ]));

const decodeContactsBook = (value: string): ContactsBook => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map();

    const contacts = new Map<string, ContactBookEntry>();
    for (const rawEntry of parsed) {
      if (!Array.isArray(rawEntry) || rawEntry.length !== 2) continue;
      const [peerId, rawValue] = rawEntry;
      if (typeof peerId !== "string" || typeof rawValue !== "object" || rawValue === null) continue;

      const valueObj = rawValue as Record<string, unknown>;
      const nicknameRaw = valueObj.nickname;
      const selfNameRaw = valueObj.selfName;
      const seenSelfNamesRaw = valueObj.seenSelfNames;
      const lastSeenAt = valueObj.lastSeenAt;
      const groupIdsRaw = valueObj.groupIds;

      if (
        !(nicknameRaw === undefined || nicknameRaw === null || typeof nicknameRaw === "string") ||
        !(selfNameRaw === null || typeof selfNameRaw === "string") ||
        !(seenSelfNamesRaw === undefined || Array.isArray(seenSelfNamesRaw)) ||
        typeof lastSeenAt !== "number" ||
        !Number.isFinite(lastSeenAt) ||
        !Array.isArray(groupIdsRaw)
      ) {
        continue;
      }

      const nickname = typeof nicknameRaw === "string" && nicknameRaw.trim().length > 0
        ? nicknameRaw.trim()
        : null;
      const selfName = typeof selfNameRaw === "string" && selfNameRaw.trim().length > 0
        ? selfNameRaw.trim()
        : null;
      const seenSelfNames = [
        ...new Set(
          (seenSelfNamesRaw ?? [])
            .filter((name): name is string => typeof name === "string")
            .map((name) => name.trim())
            .filter((name) => name.length > 0),
        ),
      ];
      if (seenSelfNames.length === 0 && selfName) {
        seenSelfNames.push(selfName);
      }
      const groupIds = [...new Set(groupIdsRaw.filter((g): g is string => typeof g === "string" && g.length > 0))];

      contacts.set(peerId, {
        peerId,
        nickname,
        selfName,
        seenSelfNames,
        lastSeenAt,
        groupIds,
      });
    }
    return contacts;
  } catch {
    return new Map();
  }
};

const encodeContactsBook = (contacts: ContactsBook): string =>
  JSON.stringify([...contacts.entries()].map(([peerId, entry]) => [
    peerId,
    {
      nickname: entry.nickname,
      selfName: entry.selfName,
      seenSelfNames: [...entry.seenSelfNames],
      lastSeenAt: entry.lastSeenAt,
      groupIds: [...entry.groupIds],
    },
  ]));

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
  readonly getJoinRetryState: () => Promise<JoinRetryState>;
  readonly saveJoinRetryState: (state: JoinRetryState) => Promise<void>;
  readonly getSyncProgressState: () => Promise<SyncProgressState>;
  readonly saveSyncProgressState: (state: SyncProgressState) => Promise<void>;
  readonly getContactsBook: () => Promise<ContactsBook>;
  readonly saveContactsBook: (contacts: ContactsBook) => Promise<void>;
  readonly getBlockedPeerIds: () => Promise<ReadonlySet<string>>;
  readonly saveBlockedPeerIds: (blockedPeerIds: ReadonlySet<string>) => Promise<void>;
  readonly destroy: () => Promise<void>;
  readonly close: () => void;
};

const decodeBlockedPeerIds = (value: string): ReadonlySet<string> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  } catch {
    return new Set();
  }
};

const encodeBlockedPeerIds = (blockedPeerIds: ReadonlySet<string>): string =>
  JSON.stringify([...blockedPeerIds]);

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

    getJoinRetryState: async () => {
      const value = await db.get("account", JOIN_RETRY_STATE_KEY);
      if (typeof value !== "string") return new Map();
      return decodeJoinRetryState(value);
    },

    saveJoinRetryState: async (state: JoinRetryState) => {
      await db.put("account", encodeJoinRetryState(state), JOIN_RETRY_STATE_KEY);
    },

    getSyncProgressState: async () => {
      const value = await db.get("account", SYNC_PROGRESS_STATE_KEY);
      if (typeof value !== "string") return new Map();
      return decodeSyncProgressState(value);
    },

    saveSyncProgressState: async (state: SyncProgressState) => {
      await db.put("account", encodeSyncProgressState(state), SYNC_PROGRESS_STATE_KEY);
    },

    getContactsBook: async () => {
      const value = await db.get("account", CONTACTS_BOOK_KEY);
      if (typeof value !== "string") return new Map();
      return decodeContactsBook(value);
    },

    saveContactsBook: async (contacts: ContactsBook) => {
      await db.put("account", encodeContactsBook(contacts), CONTACTS_BOOK_KEY);
    },

    getBlockedPeerIds: async () => {
      const value = await db.get("account", BLOCKED_PEERS_KEY);
      if (typeof value !== "string") return new Set();
      return decodeBlockedPeerIds(value);
    },

    saveBlockedPeerIds: async (blockedPeerIds: ReadonlySet<string>) => {
      await db.put("account", encodeBlockedPeerIds(blockedPeerIds), BLOCKED_PEERS_KEY);
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

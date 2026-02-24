import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { openAccountStore } from "./account-store.js";
import { generateAccountKey } from "../crypto/identity.js";
import type { JoinRetryState } from "../protocol/join-retry-queue.js";
import type { SyncProgressState } from "../protocol/multi-group-chat.js";
import type { ContactsBook } from "./account-store.js";

describe("Account Store", () => {
  describe("account key persistence", () => {
    it("should return null when no account key exists", async () => {
      const store = await openAccountStore();
      try {
        const key = await store.getAccountKey();
        expect(key).toBeNull();
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve account key", async () => {
      const store = await openAccountStore();
      try {
        const original = generateAccountKey();
        await store.saveAccountKey(original);

        const retrieved = await store.getAccountKey();

        expect(retrieved).not.toBeNull();
        expect(new Uint8Array(retrieved!.publicKey)).toEqual(new Uint8Array(original.publicKey));
        expect(new Uint8Array(retrieved!.privateKey)).toEqual(new Uint8Array(original.privateKey));
      } finally {
        await store.destroy();
      }
    });

    it("should report existence after saving", async () => {
      const store = await openAccountStore();
      try {
        expect(await store.hasAccountKey()).toBe(false);

        await store.saveAccountKey(generateAccountKey());

        expect(await store.hasAccountKey()).toBe(true);
      } finally {
        await store.destroy();
      }
    });

    it("should delete account key", async () => {
      const store = await openAccountStore();
      try {
        await store.saveAccountKey(generateAccountKey());
        await store.deleteAccountKey();

        expect(await store.hasAccountKey()).toBe(false);
        expect(await store.getAccountKey()).toBeNull();
      } finally {
        await store.destroy();
      }
    });

    it("should persist across store instances", async () => {
      const store1 = await openAccountStore();
      const original = generateAccountKey();
      await store1.saveAccountKey(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getAccountKey();
        expect(retrieved).not.toBeNull();
        expect(new Uint8Array(retrieved!.publicKey)).toEqual(new Uint8Array(original.publicKey));
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("backup status", () => {
    it("should default to not backed up", async () => {
      const store = await openAccountStore();
      try {
        const status = await store.isBackedUp();
        expect(status).toBe(false);
      } finally {
        await store.destroy();
      }
    });

    it("should store backed up status", async () => {
      const store = await openAccountStore();
      try {
        await store.setBackedUp(true);

        expect(await store.isBackedUp()).toBe(true);
      } finally {
        await store.destroy();
      }
    });

    it("should allow resetting backup status", async () => {
      const store = await openAccountStore();
      try {
        await store.setBackedUp(true);
        await store.setBackedUp(false);

        expect(await store.isBackedUp()).toBe(false);
      } finally {
        await store.destroy();
      }
    });
  });

  describe("peer private key persistence", () => {
    it("should return null when no peer private key exists", async () => {
      const store = await openAccountStore();
      try {
        const key = await store.getPeerPrivateKey();
        expect(key).toBeNull();
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve peer private key", async () => {
      const store = await openAccountStore();
      try {
        const original = new Uint8Array(64);
        crypto.getRandomValues(original);

        await store.savePeerPrivateKey(original);
        const retrieved = await store.getPeerPrivateKey();

        expect(retrieved).not.toBeNull();
        expect(new Uint8Array(retrieved!)).toEqual(original);
      } finally {
        await store.destroy();
      }
    });

    it("should persist peer private key across store instances", async () => {
      const store1 = await openAccountStore();
      const original = new Uint8Array(64);
      crypto.getRandomValues(original);
      await store1.savePeerPrivateKey(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getPeerPrivateKey();
        expect(retrieved).not.toBeNull();
        expect(new Uint8Array(retrieved!)).toEqual(original);
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("peer path cache persistence", () => {
    it("should return empty cache when no peer path cache exists", async () => {
      const store = await openAccountStore();
      try {
        const cache = await store.getPeerPathCache();
        expect(cache.size).toBe(0);
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve peer path cache", async () => {
      const store = await openAccountStore();
      try {
        const original = new Map<string, readonly string[]>([
          ["12D3KooWPeerA", ["/dns4/r1.example/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeerA"]],
          ["12D3KooWPeerB", ["/dns4/r2.example/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeerB"]],
        ]);

        await store.savePeerPathCache(original);
        const retrieved = await store.getPeerPathCache();

        expect(retrieved).toEqual(original);
      } finally {
        await store.destroy();
      }
    });

    it("should persist peer path cache across store instances", async () => {
      const store1 = await openAccountStore();
      const original = new Map<string, readonly string[]>([
        ["12D3KooWPeerA", ["/dns4/r1.example/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeerA"]],
      ]);
      await store1.savePeerPathCache(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getPeerPathCache();
        expect(retrieved).toEqual(original);
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("join retry state persistence", () => {
    it("should return empty state when no join retry state exists", async () => {
      const store = await openAccountStore();
      try {
        const state = await store.getJoinRetryState();
        expect(state.size).toBe(0);
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve join retry state", async () => {
      const store = await openAccountStore();
      try {
        const original: JoinRetryState = new Map([
          ["group-a", {
            groupId: "group-a",
            createdAt: 1_000,
            lastAttemptAt: 2_000,
            nextAttemptAt: 7_000,
            attemptCount: 2,
            status: "active",
          }],
          ["group-b", {
            groupId: "group-b",
            createdAt: 5_000,
            lastAttemptAt: null,
            nextAttemptAt: 5_000,
            attemptCount: 0,
            status: "cancelled",
          }],
        ]);

        await store.saveJoinRetryState(original);
        const retrieved = await store.getJoinRetryState();

        expect(retrieved).toEqual(original);
      } finally {
        await store.destroy();
      }
    });

    it("should persist join retry state across store instances", async () => {
      const store1 = await openAccountStore();
      const original: JoinRetryState = new Map([
        ["group-a", {
          groupId: "group-a",
          createdAt: 1_000,
          lastAttemptAt: 1_500,
          nextAttemptAt: 6_500,
          attemptCount: 1,
          status: "active",
        }],
      ]);
      await store1.saveJoinRetryState(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getJoinRetryState();
        expect(retrieved).toEqual(original);
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("sync progress state persistence", () => {
    it("should return empty state when no sync progress state exists", async () => {
      const store = await openAccountStore();
      try {
        const state = await store.getSyncProgressState();
        expect(state.size).toBe(0);
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve sync progress state", async () => {
      const store = await openAccountStore();
      try {
        const original: SyncProgressState = new Map([
          ["group-a", new Map([
            ["12D3KooWPeerA", {
              lastRequestedAtMs: 1_000,
              lastRequestKnownHashHex: "abc",
              lastServedAtMs: 2_000,
              lastServedKnownHashHex: "def",
              lastServedHeadHashHex: "ghi",
              lastServedEnvelopeCount: 2,
              lastReceivedAtMs: 3_000,
              lastReceivedHashHex: "jkl",
              lastReceivedEnvelopeCount: 4,
            }],
          ])],
        ]);

        await store.saveSyncProgressState(original);
        const retrieved = await store.getSyncProgressState();

        expect(retrieved).toEqual(original);
      } finally {
        await store.destroy();
      }
    });

    it("should persist sync progress state across store instances", async () => {
      const store1 = await openAccountStore();
      const original: SyncProgressState = new Map([
        ["group-z", new Map([
          ["12D3KooWPeerB", {
            lastRequestedAtMs: null,
            lastRequestKnownHashHex: null,
            lastServedAtMs: 5_000,
            lastServedKnownHashHex: null,
            lastServedHeadHashHex: "head",
            lastServedEnvelopeCount: 7,
            lastReceivedAtMs: null,
            lastReceivedHashHex: null,
            lastReceivedEnvelopeCount: 0,
          }],
        ])],
      ]);
      await store1.saveSyncProgressState(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getSyncProgressState();
        expect(retrieved).toEqual(original);
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("contacts book persistence", () => {
    it("should return empty contacts when no contacts book exists", async () => {
      const store = await openAccountStore();
      try {
        const contacts = await store.getContactsBook();
        expect(contacts.size).toBe(0);
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve contacts book", async () => {
      const store = await openAccountStore();
      try {
        const original: ContactsBook = new Map([
          ["12D3KooWPeerA", {
            peerId: "12D3KooWPeerA",
            nickname: "ali",
            selfName: "Alice",
            seenSelfNames: ["Alice", "Alice Cooper"],
            lastSeenAt: 1_000,
            groupIds: ["group-a", "group-b"],
          }],
          ["12D3KooWPeerB", {
            peerId: "12D3KooWPeerB",
            nickname: null,
            selfName: null,
            seenSelfNames: [],
            lastSeenAt: 2_000,
            groupIds: ["group-a"],
          }],
        ]);

        await store.saveContactsBook(original);
        const retrieved = await store.getContactsBook();

        expect(retrieved).toEqual(original);
      } finally {
        await store.destroy();
      }
    });

    it("should persist contacts book across store instances", async () => {
      const store1 = await openAccountStore();
      const original: ContactsBook = new Map([
        ["12D3KooWPeerA", {
          peerId: "12D3KooWPeerA",
          nickname: null,
          selfName: "Alice",
          seenSelfNames: ["Alice"],
          lastSeenAt: 4_000,
          groupIds: ["group-z"],
        }],
      ]);
      await store1.saveContactsBook(original);
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getContactsBook();
        expect(retrieved).toEqual(original);
      } finally {
        await store2.destroy();
      }
    });

    it("should decode legacy contacts entries without nickname/name history", async () => {
      const store = await openAccountStore();
      store.close();

      const rawDb = await openDB("anypost:account", 1);
      try {
        await rawDb.put("account", JSON.stringify([
          ["12D3KooWPeerLegacy", {
            selfName: "Legacy Name",
            lastSeenAt: 9_000,
            groupIds: ["group-a"],
          }],
        ]), "contactsBook");
      } finally {
        rawDb.close();
      }

      const store2 = await openAccountStore();
      try {
        const contacts = await store2.getContactsBook();
        expect(contacts.get("12D3KooWPeerLegacy")).toEqual({
          peerId: "12D3KooWPeerLegacy",
          nickname: null,
          selfName: "Legacy Name",
          seenSelfNames: ["Legacy Name"],
          lastSeenAt: 9_000,
          groupIds: ["group-a"],
        });
      } finally {
        await store2.destroy();
      }
    });
  });

  describe("blocked peers persistence", () => {
    it("should return empty set when no blocked peers exist", async () => {
      const store = await openAccountStore();
      try {
        const blocked = await store.getBlockedPeerIds();
        expect(blocked.size).toBe(0);
      } finally {
        await store.destroy();
      }
    });

    it("should store and retrieve blocked peers", async () => {
      const store = await openAccountStore();
      try {
        const blocked = new Set<string>(["12D3KooWBlocked1", "12D3KooWBlocked2"]);
        await store.saveBlockedPeerIds(blocked);

        const retrieved = await store.getBlockedPeerIds();
        expect(retrieved).toEqual(blocked);
      } finally {
        await store.destroy();
      }
    });

    it("should persist blocked peers across store instances", async () => {
      const store1 = await openAccountStore();
      await store1.saveBlockedPeerIds(new Set(["12D3KooWBlockedA"]));
      store1.close();

      const store2 = await openAccountStore();
      try {
        const retrieved = await store2.getBlockedPeerIds();
        expect(retrieved).toEqual(new Set(["12D3KooWBlockedA"]));
      } finally {
        await store2.destroy();
      }
    });
  });
});

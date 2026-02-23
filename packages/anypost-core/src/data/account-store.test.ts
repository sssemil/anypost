import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { openAccountStore } from "./account-store.js";
import { generateAccountKey } from "../crypto/identity.js";

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
});

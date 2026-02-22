import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  createSettingsDocument,
  setDisplayName,
  getDisplayName,
  formatUserDisplay,
} from "./settings-document.js";

const TEST_ACCOUNT_PUBLIC_KEY = new Uint8Array([
  0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
  0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
]);

describe("Settings Document", () => {
  describe("createSettingsDocument", () => {
    it("should return a Y.Doc with account-derived guid", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);

      expect(doc).toBeInstanceOf(Y.Doc);
      expect(doc.guid).toContain("settings:");
      expect(doc.guid).toContain("deadbeef");
    });
  });

  describe("display name", () => {
    it("should store display name in settings doc", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);

      setDisplayName(doc, "Alice");

      const result = getDisplayName(doc);
      expect(result).toBe("Alice");
    });

    it("should retrieve display name from settings doc", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);
      setDisplayName(doc, "Bob");

      const result = getDisplayName(doc);

      expect(result).toBe("Bob");
    });

    it("should return null for unset display name", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);

      const result = getDisplayName(doc);

      expect(result).toBeNull();
    });

    it("should return null when display name is empty string", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);
      const profileMap = doc.getMap("profile");
      profileMap.set("displayName", "");

      const result = getDisplayName(doc);

      expect(result).toBeNull();
    });

    it("should overwrite display name when set again", () => {
      const doc = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);
      setDisplayName(doc, "Alice");
      setDisplayName(doc, "Alice 2.0");

      const result = getDisplayName(doc);

      expect(result).toBe("Alice 2.0");
    });
  });

  describe("formatUserDisplay", () => {
    it("should format as DisplayName (..xxxx) with last 4 hex chars of public key", () => {
      const result = formatUserDisplay("Alice", TEST_ACCOUNT_PUBLIC_KEY);

      expect(result).toBe("Alice (..191a1b1c)");
    });

    it("should work with different display names", () => {
      const result = formatUserDisplay("Bob", TEST_ACCOUNT_PUBLIC_KEY);

      expect(result).toBe("Bob (..191a1b1c)");
    });
  });

  describe("CRDT syncing", () => {
    it("should sync display name between two settings docs via Yjs", () => {
      const doc1 = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);
      const doc2 = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);

      setDisplayName(doc1, "Alice");

      const update = Y.encodeStateAsUpdate(doc1);
      Y.applyUpdate(doc2, update);

      expect(getDisplayName(doc2)).toBe("Alice");
    });

    it("should merge concurrent display name changes with last-write-wins", () => {
      const doc1 = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);
      const doc2 = createSettingsDocument(TEST_ACCOUNT_PUBLIC_KEY);

      setDisplayName(doc1, "Alice");
      setDisplayName(doc2, "Bob");

      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc2, update1);
      Y.applyUpdate(doc1, update2);

      const name1 = getDisplayName(doc1);
      const name2 = getDisplayName(doc2);
      expect(name1).toBe(name2);
    });
  });
});

import { describe, it, expect } from "vitest";
import { pushEntry, removeEntry, topEntry } from "./escape-stack.js";
import type { EscapeEntry } from "./escape-stack.js";

const makeEntry = (id: string): EscapeEntry => ({
  id,
  handler: () => {},
});

describe("escape stack", () => {
  describe("pushEntry", () => {
    it("should add an entry to an empty stack", () => {
      const entry = makeEntry("a");
      const result = pushEntry([], entry);

      expect(result).toEqual([entry]);
    });

    it("should append an entry after existing entries", () => {
      const a = makeEntry("a");
      const b = makeEntry("b");
      const stack = pushEntry([], a);
      const result = pushEntry(stack, b);

      expect(result).toEqual([a, b]);
    });

    it("should replace an existing entry with the same id and move it to the top", () => {
      const a = makeEntry("a");
      const b = makeEntry("b");
      const stack = pushEntry(pushEntry([], a), b);

      const newA: EscapeEntry = { id: "a", handler: () => {} };
      const result = pushEntry(stack, newA);

      expect(result.length).toBe(2);
      expect(result[0]!.id).toBe("b");
      expect(result[1]!.id).toBe("a");
      expect(result[1]!.handler).toBe(newA.handler);
    });
  });

  describe("removeEntry", () => {
    it("should remove an entry by id", () => {
      const a = makeEntry("a");
      const b = makeEntry("b");
      const stack = pushEntry(pushEntry([], a), b);

      const result = removeEntry(stack, "a");

      expect(result).toEqual([b]);
    });

    it("should return the same array content when removing a non-existent id", () => {
      const a = makeEntry("a");
      const stack = pushEntry([], a);

      const result = removeEntry(stack, "z");

      expect(result).toEqual([a]);
    });

    it("should return an empty array when removing the last entry", () => {
      const a = makeEntry("a");
      const stack = pushEntry([], a);

      const result = removeEntry(stack, "a");

      expect(result).toEqual([]);
    });
  });

  describe("topEntry", () => {
    it("should return undefined for an empty stack", () => {
      expect(topEntry([])).toBeUndefined();
    });

    it("should return the last pushed entry", () => {
      const a = makeEntry("a");
      const b = makeEntry("b");
      const stack = pushEntry(pushEntry([], a), b);

      expect(topEntry(stack)).toBe(b);
    });

    it("should return the only entry in a single-element stack", () => {
      const a = makeEntry("a");
      const stack = pushEntry([], a);

      expect(topEntry(stack)).toBe(a);
    });
  });
});

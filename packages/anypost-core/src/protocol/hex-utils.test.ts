import { describe, it, expect } from "vitest";
import { toHex, fromHex } from "./action-chain.js";

describe("fromHex", () => {
  it("should round-trip with toHex for a 32-byte hash", () => {
    const original = new Uint8Array(32);
    original[0] = 0xab;
    original[15] = 0xcd;
    original[31] = 0xef;

    const hex = toHex(original);
    const result = fromHex(hex);

    expect(result).toEqual(original);
  });

  it("should convert a known hex string to bytes", () => {
    const result = fromHex("0102ff00");
    expect(result).toEqual(new Uint8Array([1, 2, 255, 0]));
  });

  it("should return empty Uint8Array for empty string", () => {
    expect(fromHex("")).toEqual(new Uint8Array(0));
  });

  it("should reject odd-length hex strings", () => {
    expect(() => fromHex("abc")).toThrow("Invalid hex string length");
  });

  it("should reject non-hex characters", () => {
    expect(() => fromHex("zzzz")).toThrow("Invalid hex at position 0");
  });
});

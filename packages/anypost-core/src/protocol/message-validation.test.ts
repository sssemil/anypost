import { describe, it, expect } from "vitest";
import {
  validateMessageSize,
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
} from "./message-validation.js";

describe("validateMessageSize", () => {
  it("should accept messages within size limit", () => {
    const data = new Uint8Array(1000);

    const result = validateMessageSize(data);

    expect(result.valid).toBe(true);
  });

  it("should accept messages at exactly the size limit", () => {
    const data = new Uint8Array(DEFAULT_MAX_MESSAGE_SIZE_BYTES);

    const result = validateMessageSize(data);

    expect(result.valid).toBe(true);
  });

  it("should reject messages exceeding size limit", () => {
    const data = new Uint8Array(DEFAULT_MAX_MESSAGE_SIZE_BYTES + 1);

    const result = validateMessageSize(data);

    expect(result.valid).toBe(false);
  });

  it("should include reason when rejecting oversized message", () => {
    const data = new Uint8Array(DEFAULT_MAX_MESSAGE_SIZE_BYTES + 1);

    const result = validateMessageSize(data);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("exceeds");
    }
  });

  it("should accept empty messages", () => {
    const data = new Uint8Array(0);

    const result = validateMessageSize(data);

    expect(result.valid).toBe(true);
  });

  it("should accept custom size limit", () => {
    const data = new Uint8Array(100);

    const result = validateMessageSize(data, 50);

    expect(result.valid).toBe(false);
  });

  it("should accept messages at custom size limit", () => {
    const data = new Uint8Array(50);

    const result = validateMessageSize(data, 50);

    expect(result.valid).toBe(true);
  });
});

describe("validateMessageSize input validation", () => {
  it("should reject NaN maxBytes", () => {
    expect(() => validateMessageSize(new Uint8Array(10), NaN)).toThrow(RangeError);
  });

  it("should reject negative maxBytes", () => {
    expect(() => validateMessageSize(new Uint8Array(10), -1)).toThrow(RangeError);
  });

  it("should reject Infinity maxBytes", () => {
    expect(() => validateMessageSize(new Uint8Array(10), Infinity)).toThrow(RangeError);
  });
});

describe("defaults", () => {
  it("should have 64KB max message size", () => {
    expect(DEFAULT_MAX_MESSAGE_SIZE_BYTES).toBe(65_536);
  });
});

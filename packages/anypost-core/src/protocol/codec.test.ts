import { describe, it, expect } from "vitest";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import {
  createEncryptedMessage,
  createWireMessage,
} from "../shared/factories.js";
import type { WireMessage } from "../shared/schemas.js";

describe("encodeWireMessage", () => {
  it("should produce a Uint8Array", () => {
    const message = createWireMessage();
    const encoded = encodeWireMessage(message);

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.byteLength).toBeGreaterThan(0);
  });
});

describe("decodeWireMessage", () => {
  it("should reconstruct the original message", () => {
    const message = createWireMessage();
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("encrypted_message");
      expect(result.data.payload).toEqual(message.payload);
    }
  });

  it("should return error Result for malformed input", () => {
    const garbage = new Uint8Array([0xff, 0xfe, 0xfd, 0x00]);
    const result = decodeWireMessage(garbage);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("should return error Result for valid CBOR but invalid schema", async () => {
    const invalidMessage = { type: "unknown_type", payload: {} };
    const { encode } = await import("cbor-x");
    const encoded = encode(invalidMessage);
    const result = decodeWireMessage(new Uint8Array(encoded));

    expect(result.success).toBe(false);
  });
});

describe("round-trip", () => {
  it("should round-trip encrypted_message type", () => {
    const message: WireMessage = {
      type: "encrypted_message",
      payload: createEncryptedMessage(),
    };
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(message);
    }
  });

  it("should round-trip mls_commit type", () => {
    const message: WireMessage = {
      type: "mls_commit",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        epoch: 1,
        commitData: new Uint8Array([10, 20, 30]),
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      },
    };
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(message);
    }
  });

  it("should round-trip sync_request type", () => {
    const message: WireMessage = {
      type: "sync_request",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        stateVector: new Uint8Array([5, 6, 7, 8]),
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      },
    };
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(message);
    }
  });

  it("should handle messages with large Uint8Array payloads", () => {
    const largeCiphertext = new Uint8Array(10000);
    largeCiphertext.fill(42);

    const message: WireMessage = {
      type: "encrypted_message",
      payload: createEncryptedMessage({ ciphertext: largeCiphertext }),
    };
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload).toEqual(message.payload);
    }
  });
});

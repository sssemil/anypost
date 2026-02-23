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
    if (result.success && result.data.type === "encrypted_message" && message.type === "encrypted_message") {
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
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        senderPublicKey: new Uint8Array(32).fill(3),
        signature: new Uint8Array(64).fill(4),
        targetPeerId: "12D3KooWQkVLLv8c9r7y9ZwzhsMvy4c8h6ivm8xv3vN4K8n9sYf2",
        knownHash: new Uint8Array([5, 6, 7, 8]),
      },
    };
    const encoded = encodeWireMessage(message);
    const result = decodeWireMessage(encoded);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(message);
    }
  });

  it("should round-trip sync_response type", () => {
    const message: WireMessage = {
      type: "sync_response",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        senderPublicKey: new Uint8Array(32).fill(3),
        signature: new Uint8Array(64).fill(4),
        targetPeerId: "12D3KooWQkVLLv8c9r7y9ZwzhsMvy4c8h6ivm8xv3vN4K8n9sYf2",
        requestKnownHash: new Uint8Array([1, 2, 3]),
        headHash: new Uint8Array([4, 5, 6]),
        nextCursorHash: new Uint8Array([7, 8, 9]),
        envelopes: [{
          signedBytes: new Uint8Array([10, 20, 30]),
          signature: new Uint8Array(64).fill(1),
          hash: new Uint8Array(32).fill(2),
        }],
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
    if (result.success && result.data.type === "encrypted_message") {
      expect(result.data.payload).toEqual(message.payload);
    }
  });
});

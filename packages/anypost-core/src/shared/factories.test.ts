import { describe, it, expect } from "vitest";
import {
  createEncryptedMessage,
  createMessageContent,
  createWireMessage,
} from "./factories.js";
import {
  EncryptedMessageSchema,
  MessageContentSchema,
  WireMessageSchema,
} from "./schemas.js";

describe("createEncryptedMessage", () => {
  it("should produce a valid EncryptedMessage with defaults", () => {
    const message = createEncryptedMessage();
    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(true);
  });

  it("should apply overrides", () => {
    const message = createEncryptedMessage({ epoch: 5 });

    expect(message.epoch).toBe(5);
    expect(EncryptedMessageSchema.safeParse(message).success).toBe(true);
  });

  it("should allow overriding ciphertext", () => {
    const ciphertext = new Uint8Array([99, 98, 97]);
    const message = createEncryptedMessage({ ciphertext });

    expect(message.ciphertext).toBe(ciphertext);
  });
});

describe("createMessageContent", () => {
  it("should produce a valid text MessageContent with defaults", () => {
    const content = createMessageContent();
    const result = MessageContentSchema.safeParse(content);

    expect(result.success).toBe(true);
  });

  it("should apply text override", () => {
    const content = createMessageContent({ text: "custom text" });

    expect(content.text).toBe("custom text");
    expect(MessageContentSchema.safeParse(content).success).toBe(true);
  });
});

describe("createWireMessage", () => {
  it("should produce a valid encrypted_message WireMessage by default", () => {
    const wireMsg = createWireMessage();
    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
    expect(wireMsg.type).toBe("encrypted_message");
  });

  it("should accept full override", () => {
    const wireMsg = createWireMessage({
      type: "sync_request",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        senderPublicKey: new Uint8Array(32).fill(3),
        signature: new Uint8Array(64).fill(4),
        knownHash: new Uint8Array([1, 2, 3]),
      },
    });

    expect(wireMsg.type).toBe("sync_request");
    expect(WireMessageSchema.safeParse(wireMsg).success).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  PeerIdSchema,
  GroupIdSchema,
  ChannelIdSchema,
  MessageIdSchema,
  AccountPublicKeySchema,
  EncryptedMessageSchema,
  MessageContentSchema,
  WireMessageSchema,
} from "./schemas.js";

describe("PeerIdSchema", () => {
  it("should accept valid peer ID strings", () => {
    const result = PeerIdSchema.safeParse("12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn");

    expect(result.success).toBe(true);
  });

  it("should reject empty strings", () => {
    const result = PeerIdSchema.safeParse("");

    expect(result.success).toBe(false);
  });
});

describe("GroupIdSchema", () => {
  it("should accept valid UUIDs", () => {
    const result = GroupIdSchema.safeParse(
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );

    expect(result.success).toBe(true);
  });

  it("should reject non-UUID strings", () => {
    const result = GroupIdSchema.safeParse("not-a-uuid");

    expect(result.success).toBe(false);
  });

  it("should reject empty strings", () => {
    const result = GroupIdSchema.safeParse("");

    expect(result.success).toBe(false);
  });
});

describe("ChannelIdSchema", () => {
  it("should accept valid UUIDs", () => {
    const result = ChannelIdSchema.safeParse(
      "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    );

    expect(result.success).toBe(true);
  });

  it("should reject non-UUID strings", () => {
    const result = ChannelIdSchema.safeParse("invalid");

    expect(result.success).toBe(false);
  });
});

describe("MessageIdSchema", () => {
  it("should accept valid UUIDs", () => {
    const result = MessageIdSchema.safeParse(
      "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    );

    expect(result.success).toBe(true);
  });

  it("should reject non-UUID strings", () => {
    const result = MessageIdSchema.safeParse("invalid");

    expect(result.success).toBe(false);
  });
});

describe("AccountPublicKeySchema", () => {
  it("should accept valid base64-encoded public key strings", () => {
    const validKey = "MCowBQYDK2VwAyEAGb1gauf4MgJKfPKRjQbn7dDEJJknxOKi3VqZBZ9buOY=";
    const result = AccountPublicKeySchema.safeParse(validKey);

    expect(result.success).toBe(true);
  });

  it("should reject empty strings", () => {
    const result = AccountPublicKeySchema.safeParse("");

    expect(result.success).toBe(false);
  });
});

describe("EncryptedMessageSchema", () => {
  it("should validate complete message objects", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: 0,
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      timestamp: Date.now(),
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(true);
  });

  it("should reject messages with missing fields", () => {
    const incomplete = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    };

    const result = EncryptedMessageSchema.safeParse(incomplete);

    expect(result.success).toBe(false);
  });

  it("should accept messages with a display name", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: 0,
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      timestamp: Date.now(),
      senderDisplayName: "Alice",
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.senderDisplayName).toBe("Alice");
    }
  });

  it("should accept messages without a display name for backward compatibility", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: 0,
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      timestamp: Date.now(),
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.senderDisplayName).toBeUndefined();
    }
  });

  it("should reject empty string display names", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: 0,
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      timestamp: Date.now(),
      senderDisplayName: "",
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(false);
  });

  it("should reject display names exceeding 100 characters", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: 0,
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      timestamp: Date.now(),
      senderDisplayName: "A".repeat(101),
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(false);
  });

  it("should reject messages with invalid epoch", () => {
    const message = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      epoch: -1,
      ciphertext: new Uint8Array([1, 2, 3]),
      timestamp: Date.now(),
    };

    const result = EncryptedMessageSchema.safeParse(message);

    expect(result.success).toBe(false);
  });
});

describe("MessageContentSchema", () => {
  it("should accept text-only messages", () => {
    const content = {
      type: "text" as const,
      text: "Hello, world!",
    };

    const result = MessageContentSchema.safeParse(content);

    expect(result.success).toBe(true);
  });

  it("should accept messages with attachments", () => {
    const content = {
      type: "text" as const,
      text: "Check this out",
      attachments: [
        {
          name: "photo.png",
          mimeType: "image/png",
          size: 1024,
          data: new Uint8Array([0, 1, 2]),
        },
      ],
    };

    const result = MessageContentSchema.safeParse(content);

    expect(result.success).toBe(true);
  });

  it("should reject messages with empty text", () => {
    const content = {
      type: "text" as const,
      text: "",
    };

    const result = MessageContentSchema.safeParse(content);

    expect(result.success).toBe(false);
  });
});

describe("WireMessageSchema", () => {
  it("should validate encrypted_message type", () => {
    const wireMsg = {
      type: "encrypted_message" as const,
      payload: {
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        channelId: "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        epoch: 0,
        ciphertext: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
      },
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should validate mls_commit type", () => {
    const wireMsg = {
      type: "mls_commit" as const,
      payload: {
        groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        epoch: 1,
        commitData: new Uint8Array([10, 20, 30]),
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      },
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should validate sync_request type", () => {
    const wireMsg = {
      type: "sync_request" as const,
      payload: {
        groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        targetPeerId: "12D3KooWQkVLLv8c9r7y9ZwzhsMvy4c8h6ivm8xv3vN4K8n9sYf2",
        knownHash: new Uint8Array(32).fill(5),
      },
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should validate sync_response type", () => {
    const wireMsg = {
      type: "sync_response" as const,
      payload: {
        groupId: "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        targetPeerId: "12D3KooWQkVLLv8c9r7y9ZwzhsMvy4c8h6ivm8xv3vN4K8n9sYf2",
        requestKnownHash: new Uint8Array(32).fill(1),
        headHash: new Uint8Array(32).fill(2),
        envelopes: [
          {
            signedBytes: new Uint8Array([1, 2, 3]),
            signature: new Uint8Array(64).fill(7),
            hash: new Uint8Array(32).fill(9),
          },
        ],
      },
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should validate signed_action type", () => {
    const wireMsg = {
      type: "signed_action" as const,
      signedBytes: new Uint8Array([1, 2, 3]),
      signature: new Uint8Array(64).fill(0),
      hash: new Uint8Array(32).fill(0),
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should validate join_request type", () => {
    const wireMsg = {
      type: "join_request" as const,
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      requesterPublicKey: new Uint8Array(32).fill(1),
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(true);
  });

  it("should reject join_request with non-UUID groupId", () => {
    const wireMsg = {
      type: "join_request" as const,
      groupId: "not-a-uuid",
      requesterPublicKey: new Uint8Array(32).fill(1),
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(false);
  });

  it("should reject unknown message types", () => {
    const wireMsg = {
      type: "unknown_type",
      payload: {},
    };

    const result = WireMessageSchema.safeParse(wireMsg);

    expect(result.success).toBe(false);
  });
});

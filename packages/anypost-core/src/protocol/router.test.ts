import { describe, it, expect, vi } from "vitest";
import {
  createRouter,
  groupTopic,
  deviceDiscoveryTopic,
  type MessageHandler,
} from "./router.js";
import { createWireMessage } from "../shared/factories.js";
import type { WireMessage } from "../shared/schemas.js";

const createMockHandlers = (): MessageHandler => ({
  onEncryptedMessage: vi.fn(),
  onMlsCommit: vi.fn(),
  onSyncRequest: vi.fn(),
  onSyncResponse: vi.fn(),
  onSignedAction: vi.fn(),
  onJoinRequest: vi.fn(),
});

describe("createRouter", () => {
  it("should dispatch encrypted_message to message handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message = createWireMessage();

    router.handleMessage(message);

    if (message.type === "encrypted_message") {
      expect(handlers.onEncryptedMessage).toHaveBeenCalledWith(message.payload);
    }
  });

  it("should dispatch mls_commit to MLS handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message: WireMessage = {
      type: "mls_commit",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        epoch: 0,
        commitData: new Uint8Array([1, 2, 3]),
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      },
    };

    router.handleMessage(message);

    expect(handlers.onMlsCommit).toHaveBeenCalledWith(message.payload);
  });

  it("should dispatch sync_request to sync handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message: WireMessage = {
      type: "sync_request",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        senderPublicKey: new Uint8Array(32).fill(3),
        signature: new Uint8Array(64).fill(4),
        requestId: "d4ffbc99-9c0b-4ef8-bb6d-6bb9bd380a44",
        knownHash: new Uint8Array([5, 6, 7]),
      },
    };

    router.handleMessage(message);

    expect(handlers.onSyncRequest).toHaveBeenCalledWith(message.payload);
  });

  it("should dispatch sync_response to sync response handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message: WireMessage = {
      type: "sync_response",
      payload: {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
        senderPublicKey: new Uint8Array(32).fill(3),
        signature: new Uint8Array(64).fill(4),
        requestId: "e5ffbc99-9c0b-4ef8-bb6d-6bb9bd380a55",
        targetPeerId: "12D3KooWQkVLLv8c9r7y9ZwzhsMvy4c8h6ivm8xv3vN4K8n9sYf2",
        envelopes: [],
      },
    };

    router.handleMessage(message);

    expect(handlers.onSyncResponse).toHaveBeenCalledWith(message.payload);
  });

  it("should dispatch signed_action to signed action handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message: WireMessage = {
      type: "signed_action",
      signedBytes: new Uint8Array([1, 2, 3]),
      signature: new Uint8Array(64).fill(0),
      hash: new Uint8Array(32).fill(0),
    };

    router.handleMessage(message);

    expect(handlers.onSignedAction).toHaveBeenCalledWith({
      signedBytes: message.signedBytes,
      signature: message.signature,
      hash: message.hash,
    });
  });

  it("should dispatch join_request to join request handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message: WireMessage = {
      type: "join_request",
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      requesterPublicKey: new Uint8Array(32).fill(1),
      signature: new Uint8Array(64).fill(2),
    };

    router.handleMessage(message);

    expect(handlers.onJoinRequest).toHaveBeenCalledWith({
      groupId: message.groupId,
      senderPeerId: message.senderPeerId,
      requesterPublicKey: message.requesterPublicKey,
      signature: message.signature,
    });
  });

  it("should not call other handlers when dispatching a specific type", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message = createWireMessage();

    router.handleMessage(message);

    expect(handlers.onEncryptedMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onMlsCommit).not.toHaveBeenCalled();
    expect(handlers.onSyncRequest).not.toHaveBeenCalled();
    expect(handlers.onSyncResponse).not.toHaveBeenCalled();
    expect(handlers.onSignedAction).not.toHaveBeenCalled();
    expect(handlers.onJoinRequest).not.toHaveBeenCalled();
  });
});

describe("groupTopic", () => {
  it("should return a topic string for a group ID", () => {
    const topic = groupTopic("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");

    expect(topic).toBe("anypost/group/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
  });

  it("should produce different topics for different group IDs", () => {
    const topic1 = groupTopic("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    const topic2 = groupTopic("b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22");

    expect(topic1).not.toBe(topic2);
  });
});

describe("deviceDiscoveryTopic", () => {
  it("should return a topic string derived from account public key", () => {
    const pubKeyHex = "abcdef0123456789";
    const topic = deviceDiscoveryTopic(pubKeyHex);

    expect(topic).toBe("anypost/account/abcdef0123456789/devices");
  });

  it("should produce different topics for different accounts", () => {
    const topic1 = deviceDiscoveryTopic("aaa111");
    const topic2 = deviceDiscoveryTopic("bbb222");

    expect(topic1).not.toBe(topic2);
  });
});

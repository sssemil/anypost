import { describe, it, expect, vi } from "vitest";
import {
  createRouter,
  groupTopic,
  type MessageHandler,
} from "./router.js";
import { createWireMessage } from "../shared/factories.js";
import type { WireMessage } from "../shared/schemas.js";

const createMockHandlers = (): MessageHandler => ({
  onEncryptedMessage: vi.fn(),
  onMlsCommit: vi.fn(),
  onSyncRequest: vi.fn(),
});

describe("createRouter", () => {
  it("should dispatch encrypted_message to message handler", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message = createWireMessage();

    router.handleMessage(message);

    expect(handlers.onEncryptedMessage).toHaveBeenCalledWith(message.payload);
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
        stateVector: new Uint8Array([5, 6, 7]),
        senderPeerId: "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      },
    };

    router.handleMessage(message);

    expect(handlers.onSyncRequest).toHaveBeenCalledWith(message.payload);
  });

  it("should not call other handlers when dispatching a specific type", () => {
    const handlers = createMockHandlers();
    const router = createRouter(handlers);
    const message = createWireMessage();

    router.handleMessage(message);

    expect(handlers.onEncryptedMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onMlsCommit).not.toHaveBeenCalled();
    expect(handlers.onSyncRequest).not.toHaveBeenCalled();
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

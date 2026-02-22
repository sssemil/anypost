import { describe, it, expect } from "vitest";
import {
  createPendingMessage,
  confirmMessage,
  failMessage,
  getPendingMessages,
  createOutbox,
} from "./optimistic-send.js";

describe("Optimistic Send", () => {
  it("should create an empty outbox", () => {
    const outbox = createOutbox();

    expect(getPendingMessages(outbox)).toHaveLength(0);
  });

  it("should add a pending message to the outbox", () => {
    let outbox = createOutbox();

    outbox = createPendingMessage(outbox, {
      id: "msg-1",
      text: "Hello world",
    });

    const pending = getPendingMessages(outbox);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("msg-1");
    expect(pending[0].text).toBe("Hello world");
    expect(pending[0].status).toBe("sending");
  });

  it("should track multiple pending messages", () => {
    let outbox = createOutbox();

    outbox = createPendingMessage(outbox, { id: "msg-1", text: "First" });
    outbox = createPendingMessage(outbox, { id: "msg-2", text: "Second" });

    expect(getPendingMessages(outbox)).toHaveLength(2);
  });

  it("should confirm a pending message and remove it from the outbox", () => {
    let outbox = createOutbox();
    outbox = createPendingMessage(outbox, { id: "msg-1", text: "Hello" });

    outbox = confirmMessage(outbox, "msg-1");

    expect(getPendingMessages(outbox)).toHaveLength(0);
  });

  it("should mark a message as failed with an error reason", () => {
    let outbox = createOutbox();
    outbox = createPendingMessage(outbox, { id: "msg-1", text: "Hello" });

    outbox = failMessage(outbox, "msg-1", "Network error");

    const pending = getPendingMessages(outbox);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("failed");
    expect(pending[0].error).toBe("Network error");
  });

  it("should only remove the confirmed message, leaving others pending", () => {
    let outbox = createOutbox();
    outbox = createPendingMessage(outbox, { id: "msg-1", text: "First" });
    outbox = createPendingMessage(outbox, { id: "msg-2", text: "Second" });

    outbox = confirmMessage(outbox, "msg-1");

    const pending = getPendingMessages(outbox);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("msg-2");
  });

  it("should return outbox unchanged when confirming unknown message id", () => {
    let outbox = createOutbox();
    outbox = createPendingMessage(outbox, { id: "msg-1", text: "Hello" });

    const unchanged = confirmMessage(outbox, "unknown-id");

    expect(getPendingMessages(unchanged)).toHaveLength(1);
  });
});

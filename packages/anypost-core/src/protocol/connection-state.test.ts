import { describe, it, expect } from "vitest";
import {
  createConnectionState,
  transitionTo,
  connectionQuality,
} from "./connection-state.js";

describe("Connection State Machine", () => {
  it("should start in disconnected state", () => {
    const state = createConnectionState();

    expect(state.status).toBe("disconnected");
  });

  it("should transition from disconnected to connecting-to-relay", () => {
    const state = createConnectionState();

    const next = transitionTo(state, "connecting-to-relay");

    expect(next.status).toBe("connecting-to-relay");
  });

  it("should transition from connecting-to-relay to discovering-peers", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");

    const next = transitionTo(state, "discovering-peers");

    expect(next.status).toBe("discovering-peers");
  });

  it("should transition from discovering-peers to connected-relayed", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");

    const next = transitionTo(state, "connected-relayed");

    expect(next.status).toBe("connected-relayed");
  });

  it("should transition from connected-relayed to connected-direct", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");
    state = transitionTo(state, "connected-relayed");

    const next = transitionTo(state, "connected-direct");

    expect(next.status).toBe("connected-direct");
  });

  it("should allow transitioning back to disconnected from any state", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");

    const next = transitionTo(state, "disconnected");

    expect(next.status).toBe("disconnected");
  });

  it("should reject invalid transitions", () => {
    const state = createConnectionState();

    expect(() => transitionTo(state, "connected-direct")).toThrow(
      "Invalid transition",
    );
  });

  it("should reject transition from connected-direct to connecting-to-relay", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");
    state = transitionTo(state, "connected-relayed");
    state = transitionTo(state, "connected-direct");

    expect(() => transitionTo(state, "connecting-to-relay")).toThrow(
      "Invalid transition",
    );
  });

  it("should preserve error information when transitioning to disconnected", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");

    const next = transitionTo(state, "disconnected", "Relay unreachable");

    expect(next.status).toBe("disconnected");
    expect(next.error).toBe("Relay unreachable");
  });

  it("should clear error when transitioning to a non-disconnected state", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "disconnected", "Relay unreachable");

    const next = transitionTo(state, "connecting-to-relay");

    expect(next.error).toBeUndefined();
  });
});

describe("connectionQuality", () => {
  it("should return 'red' for disconnected", () => {
    const state = createConnectionState();

    expect(connectionQuality(state)).toBe("red");
  });

  it("should return 'yellow' for connecting-to-relay", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");

    expect(connectionQuality(state)).toBe("yellow");
  });

  it("should return 'yellow' for discovering-peers", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");

    expect(connectionQuality(state)).toBe("yellow");
  });

  it("should return 'yellow' for connected-relayed", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");
    state = transitionTo(state, "connected-relayed");

    expect(connectionQuality(state)).toBe("yellow");
  });

  it("should return 'green' for connected-direct", () => {
    let state = createConnectionState();
    state = transitionTo(state, "connecting-to-relay");
    state = transitionTo(state, "discovering-peers");
    state = transitionTo(state, "connected-relayed");
    state = transitionTo(state, "connected-direct");

    expect(connectionQuality(state)).toBe("green");
  });
});

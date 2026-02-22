import { describe, it, expect } from "vitest";
import {
  createPeerSharingState,
  setTargetPeerId,
  markCopied,
  clearCopied,
  transitionConnect,
  canConnect,
} from "./peer-sharing.js";

const OWN_PEER_ID = "12D3KooWOwnPeerIdForTestingPurposes123";
const TARGET_PEER_ID = "12D3KooWTargetPeerIdForTesting456789";

describe("createPeerSharingState", () => {
  it("should initialize with own peer ID and idle status", () => {
    const state = createPeerSharingState(OWN_PEER_ID);

    expect(state.ownPeerId).toBe(OWN_PEER_ID);
    expect(state.targetPeerId).toBe("");
    expect(state.connectStatus).toBe("idle");
    expect(state.errorMessage).toBeUndefined();
    expect(state.copied).toBe(false);
  });
});

describe("setTargetPeerId", () => {
  it("should update the target peer ID", () => {
    const state = createPeerSharingState(OWN_PEER_ID);
    const updated = setTargetPeerId(state, TARGET_PEER_ID);

    expect(updated.targetPeerId).toBe(TARGET_PEER_ID);
  });

  it("should not mutate original state", () => {
    const original = createPeerSharingState(OWN_PEER_ID);
    setTargetPeerId(original, TARGET_PEER_ID);

    expect(original.targetPeerId).toBe("");
  });
});

describe("markCopied / clearCopied", () => {
  it("should set copied to true", () => {
    const state = createPeerSharingState(OWN_PEER_ID);
    const updated = markCopied(state);

    expect(updated.copied).toBe(true);
  });

  it("should clear copied flag", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = markCopied(state);
    const updated = clearCopied(state);

    expect(updated.copied).toBe(false);
  });
});

describe("transitionConnect", () => {
  it("should transition from idle to searching", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    const updated = transitionConnect(state, { type: "search-started" });

    expect(updated.connectStatus).toBe("searching");
  });

  it("should transition from searching to connecting", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    const updated = transitionConnect(state, { type: "peer-found" });

    expect(updated.connectStatus).toBe("connecting");
  });

  it("should transition from connecting to connected", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    state = transitionConnect(state, { type: "peer-found" });
    const updated = transitionConnect(state, { type: "connected" });

    expect(updated.connectStatus).toBe("connected");
  });

  it("should transition to failed from searching with error message", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    const updated = transitionConnect(state, {
      type: "failed",
      errorMessage: "Peer not found on DHT",
    });

    expect(updated.connectStatus).toBe("failed");
    expect(updated.errorMessage).toBe("Peer not found on DHT");
  });

  it("should transition to failed from connecting with error message", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    state = transitionConnect(state, { type: "peer-found" });
    const updated = transitionConnect(state, {
      type: "failed",
      errorMessage: "Connection refused",
    });

    expect(updated.connectStatus).toBe("failed");
    expect(updated.errorMessage).toBe("Connection refused");
  });

  it("should allow retrying from failed state", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    state = transitionConnect(state, {
      type: "failed",
      errorMessage: "Peer not found",
    });
    const updated = transitionConnect(state, { type: "search-started" });

    expect(updated.connectStatus).toBe("searching");
    expect(updated.errorMessage).toBeUndefined();
  });

  it("should ignore invalid transitions", () => {
    const state = createPeerSharingState(OWN_PEER_ID);
    const updated = transitionConnect(state, { type: "peer-found" });

    expect(updated).toBe(state);
  });
});

describe("canConnect", () => {
  it("should return false when target peer ID is empty", () => {
    const state = createPeerSharingState(OWN_PEER_ID);

    expect(canConnect(state)).toBe(false);
  });

  it("should return false when target peer ID is invalid", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, "too-short");

    expect(canConnect(state)).toBe(false);
  });

  it("should return true when status is idle and target is valid", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);

    expect(canConnect(state)).toBe(true);
  });

  it("should return true when status is failed and target is valid", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    state = transitionConnect(state, {
      type: "failed",
      errorMessage: "err",
    });

    expect(canConnect(state)).toBe(true);
  });

  it("should return false when currently searching", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });

    expect(canConnect(state)).toBe(false);
  });

  it("should return false when currently connecting", () => {
    let state = createPeerSharingState(OWN_PEER_ID);
    state = setTargetPeerId(state, TARGET_PEER_ID);
    state = transitionConnect(state, { type: "search-started" });
    state = transitionConnect(state, { type: "peer-found" });

    expect(canConnect(state)).toBe(false);
  });
});

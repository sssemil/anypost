import { describe, it, expect } from "vitest";
import {
  createVideoCallState,
  addPeer,
  removePeer,
  setMuted,
  setCameraEnabled,
  getPeers,
  isMuted,
  isCameraEnabled,
  MAX_VIDEO_PEERS,
} from "./video-call.js";

describe("Video Call State", () => {
  describe("createVideoCallState", () => {
    it("should create an empty video call state with camera enabled", () => {
      const state = createVideoCallState();

      expect(getPeers(state)).toEqual([]);
      expect(isMuted(state)).toBe(false);
      expect(isCameraEnabled(state)).toBe(true);
    });
  });

  describe("addPeer", () => {
    it("should add a peer to the video call", () => {
      const state = createVideoCallState();

      const updated = addPeer(state, "peer-1");

      expect(getPeers(updated)).toEqual(["peer-1"]);
    });

    it("should add multiple peers", () => {
      let state = createVideoCallState();

      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-2");
      state = addPeer(state, "peer-3");

      expect(getPeers(state)).toEqual(["peer-1", "peer-2", "peer-3"]);
    });

    it("should not add a duplicate peer", () => {
      let state = createVideoCallState();

      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-1");

      expect(getPeers(state)).toEqual(["peer-1"]);
    });

    it("should accept exactly MAX_VIDEO_PEERS peers", () => {
      let state = createVideoCallState();

      for (let i = 0; i < MAX_VIDEO_PEERS; i++) {
        state = addPeer(state, `peer-${i}`);
      }

      expect(getPeers(state)).toHaveLength(MAX_VIDEO_PEERS);
    });

    it("should reject adding peer beyond max capacity", () => {
      let state = createVideoCallState();

      for (let i = 0; i < MAX_VIDEO_PEERS; i++) {
        state = addPeer(state, `peer-${i}`);
      }

      expect(() => addPeer(state, "peer-overflow")).toThrow(
        "Video call is full",
      );
    });
  });

  describe("removePeer", () => {
    it("should remove a peer from the video call", () => {
      let state = createVideoCallState();
      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-2");

      const updated = removePeer(state, "peer-1");

      expect(getPeers(updated)).toEqual(["peer-2"]);
    });

    it("should return unchanged state when removing unknown peer", () => {
      let state = createVideoCallState();
      state = addPeer(state, "peer-1");

      const updated = removePeer(state, "unknown");

      expect(getPeers(updated)).toEqual(["peer-1"]);
    });
  });

  describe("mute/unmute", () => {
    it("should mute the local audio", () => {
      const state = createVideoCallState();

      const muted = setMuted(state, true);

      expect(isMuted(muted)).toBe(true);
    });

    it("should unmute the local audio", () => {
      let state = createVideoCallState();
      state = setMuted(state, true);

      const unmuted = setMuted(state, false);

      expect(isMuted(unmuted)).toBe(false);
    });
  });

  describe("camera toggle", () => {
    it("should disable camera", () => {
      const state = createVideoCallState();

      const updated = setCameraEnabled(state, false);

      expect(isCameraEnabled(updated)).toBe(false);
    });

    it("should re-enable camera", () => {
      let state = createVideoCallState();
      state = setCameraEnabled(state, false);

      const updated = setCameraEnabled(state, true);

      expect(isCameraEnabled(updated)).toBe(true);
    });

    it("should preserve peers and mute state when toggling camera", () => {
      let state = createVideoCallState();
      state = addPeer(state, "peer-1");
      state = setMuted(state, true);

      const updated = setCameraEnabled(state, false);

      expect(getPeers(updated)).toEqual(["peer-1"]);
      expect(isMuted(updated)).toBe(true);
      expect(isCameraEnabled(updated)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("should not mutate the original state when adding a peer", () => {
      const original = createVideoCallState();
      addPeer(original, "peer-1");

      expect(getPeers(original)).toEqual([]);
    });

    it("should not mutate the original state when toggling camera", () => {
      const original = createVideoCallState();
      setCameraEnabled(original, false);

      expect(isCameraEnabled(original)).toBe(true);
    });
  });
});

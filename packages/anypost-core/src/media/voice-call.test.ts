import { describe, it, expect } from "vitest";
import {
  createVoiceCallState,
  addPeer,
  removePeer,
  setMuted,
  getPeers,
  isMuted,
  MAX_VOICE_PEERS,
} from "./voice-call.js";

describe("Voice Call State", () => {
  describe("createVoiceCallState", () => {
    it("should create an empty voice call state", () => {
      const state = createVoiceCallState();

      expect(getPeers(state)).toEqual([]);
      expect(isMuted(state)).toBe(false);
    });
  });

  describe("addPeer", () => {
    it("should add a peer to the voice call", () => {
      const state = createVoiceCallState();

      const updated = addPeer(state, "peer-1");

      expect(getPeers(updated)).toEqual(["peer-1"]);
    });

    it("should add multiple peers", () => {
      let state = createVoiceCallState();

      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-2");
      state = addPeer(state, "peer-3");

      expect(getPeers(state)).toEqual(["peer-1", "peer-2", "peer-3"]);
    });

    it("should not add a duplicate peer", () => {
      let state = createVoiceCallState();

      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-1");

      expect(getPeers(state)).toEqual(["peer-1"]);
    });

    it("should accept exactly MAX_VOICE_PEERS peers", () => {
      let state = createVoiceCallState();

      for (let i = 0; i < MAX_VOICE_PEERS; i++) {
        state = addPeer(state, `peer-${i}`);
      }

      expect(getPeers(state)).toHaveLength(MAX_VOICE_PEERS);
    });

    it("should reject adding peer beyond max capacity", () => {
      let state = createVoiceCallState();

      for (let i = 0; i < MAX_VOICE_PEERS; i++) {
        state = addPeer(state, `peer-${i}`);
      }

      expect(() => addPeer(state, "peer-overflow")).toThrow(
        "Voice channel is full",
      );
    });
  });

  describe("removePeer", () => {
    it("should remove a peer from the voice call", () => {
      let state = createVoiceCallState();
      state = addPeer(state, "peer-1");
      state = addPeer(state, "peer-2");

      const updated = removePeer(state, "peer-1");

      expect(getPeers(updated)).toEqual(["peer-2"]);
    });

    it("should return unchanged state when removing unknown peer", () => {
      let state = createVoiceCallState();
      state = addPeer(state, "peer-1");

      const updated = removePeer(state, "unknown");

      expect(getPeers(updated)).toEqual(["peer-1"]);
    });
  });

  describe("mute/unmute", () => {
    it("should mute the local audio", () => {
      const state = createVoiceCallState();

      const muted = setMuted(state, true);

      expect(isMuted(muted)).toBe(true);
    });

    it("should unmute the local audio", () => {
      let state = createVoiceCallState();
      state = setMuted(state, true);

      const unmuted = setMuted(state, false);

      expect(isMuted(unmuted)).toBe(false);
    });

    it("should preserve peers when toggling mute", () => {
      let state = createVoiceCallState();
      state = addPeer(state, "peer-1");

      const muted = setMuted(state, true);

      expect(getPeers(muted)).toEqual(["peer-1"]);
      expect(isMuted(muted)).toBe(true);
    });
  });

  describe("immutability", () => {
    it("should not mutate the original state when adding a peer", () => {
      const original = createVoiceCallState();
      addPeer(original, "peer-1");

      expect(getPeers(original)).toEqual([]);
    });

    it("should not mutate the original state when removing a peer", () => {
      let state = createVoiceCallState();
      state = addPeer(state, "peer-1");
      removePeer(state, "peer-1");

      expect(getPeers(state)).toEqual(["peer-1"]);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  createScreenShareState,
  startScreenShare,
  stopScreenShare,
  isSharing,
  getPreviousCameraEnabled,
} from "./screen-share.js";

describe("Screen Share State", () => {
  describe("createScreenShareState", () => {
    it("should create state with sharing disabled", () => {
      const state = createScreenShareState();

      expect(isSharing(state)).toBe(false);
      expect(getPreviousCameraEnabled(state)).toBeNull();
    });
  });

  describe("startScreenShare", () => {
    it("should enable sharing", () => {
      const state = createScreenShareState();

      const updated = startScreenShare(state, false);

      expect(isSharing(updated)).toBe(true);
    });

    it("should record that camera was active before sharing", () => {
      const state = createScreenShareState();

      const updated = startScreenShare(state, true);

      expect(getPreviousCameraEnabled(updated)).toBe(true);
    });

    it("should record that camera was inactive before sharing", () => {
      const state = createScreenShareState();

      const updated = startScreenShare(state, false);

      expect(getPreviousCameraEnabled(updated)).toBe(false);
    });

    it("should be idempotent when already sharing", () => {
      let state = createScreenShareState();
      state = startScreenShare(state, true);

      const updated = startScreenShare(state, false);

      expect(isSharing(updated)).toBe(true);
      expect(getPreviousCameraEnabled(updated)).toBe(true);
    });
  });

  describe("stopScreenShare", () => {
    it("should disable sharing", () => {
      let state = createScreenShareState();
      state = startScreenShare(state, false);

      const updated = stopScreenShare(state);

      expect(isSharing(updated)).toBe(false);
    });

    it("should clear previous camera state", () => {
      let state = createScreenShareState();
      state = startScreenShare(state, true);

      const updated = stopScreenShare(state);

      expect(getPreviousCameraEnabled(updated)).toBeNull();
    });

    it("should return previous camera enabled state before clearing", () => {
      let state = createScreenShareState();
      state = startScreenShare(state, true);

      expect(getPreviousCameraEnabled(state)).toBe(true);

      const updated = stopScreenShare(state);
      expect(getPreviousCameraEnabled(updated)).toBeNull();
    });

    it("should be a no-op when not sharing", () => {
      const state = createScreenShareState();

      const updated = stopScreenShare(state);

      expect(isSharing(updated)).toBe(false);
      expect(getPreviousCameraEnabled(updated)).toBeNull();
    });
  });

  describe("immutability", () => {
    it("should not mutate the original state when starting screen share", () => {
      const original = createScreenShareState();
      startScreenShare(original, true);

      expect(isSharing(original)).toBe(false);
      expect(getPreviousCameraEnabled(original)).toBeNull();
    });

    it("should not mutate the original state when stopping screen share", () => {
      let state = createScreenShareState();
      state = startScreenShare(state, true);
      stopScreenShare(state);

      expect(isSharing(state)).toBe(true);
      expect(getPreviousCameraEnabled(state)).toBe(true);
    });
  });
});

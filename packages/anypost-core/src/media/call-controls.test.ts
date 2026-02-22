import { describe, it, expect } from "vitest";
import { getCallControlsState } from "./call-controls.js";

describe("Call Controls State", () => {
  it("should show all controls as inactive when not in a call", () => {
    const controls = getCallControlsState({
      inCall: false,
      muted: false,
      cameraEnabled: false,
      screenSharing: false,
    });

    expect(controls).toEqual({
      canToggleMute: false,
      canToggleCamera: false,
      canToggleScreenShare: false,
      canHangUp: false,
      isMuted: false,
      isCameraEnabled: false,
      isScreenSharing: false,
    });
  });

  it("should enable all controls when in a call", () => {
    const controls = getCallControlsState({
      inCall: true,
      muted: false,
      cameraEnabled: false,
      screenSharing: false,
    });

    expect(controls.canToggleMute).toBe(true);
    expect(controls.canToggleCamera).toBe(true);
    expect(controls.canToggleScreenShare).toBe(true);
    expect(controls.canHangUp).toBe(true);
  });

  it("should reflect muted state", () => {
    const controls = getCallControlsState({
      inCall: true,
      muted: true,
      cameraEnabled: false,
      screenSharing: false,
    });

    expect(controls.isMuted).toBe(true);
  });

  it("should reflect camera enabled state", () => {
    const controls = getCallControlsState({
      inCall: true,
      muted: false,
      cameraEnabled: true,
      screenSharing: false,
    });

    expect(controls.isCameraEnabled).toBe(true);
  });

  it("should reflect screen sharing state", () => {
    const controls = getCallControlsState({
      inCall: true,
      muted: false,
      cameraEnabled: false,
      screenSharing: true,
    });

    expect(controls.isScreenSharing).toBe(true);
  });

  it("should reflect all active states simultaneously", () => {
    const controls = getCallControlsState({
      inCall: true,
      muted: true,
      cameraEnabled: true,
      screenSharing: true,
    });

    expect(controls).toEqual({
      canToggleMute: true,
      canToggleCamera: true,
      canToggleScreenShare: true,
      canHangUp: true,
      isMuted: true,
      isCameraEnabled: true,
      isScreenSharing: true,
    });
  });
});

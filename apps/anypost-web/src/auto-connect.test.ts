import { describe, it, expect } from "vitest";
import { decideAutoConnect } from "./auto-connect.js";

type AutoConnectInput = {
  readonly onboardingStatus: string;
  readonly chatStatus: "connecting" | "connected" | "disconnected";
};

const createInput = (overrides?: Partial<AutoConnectInput>): AutoConnectInput => ({
  onboardingStatus: "ready",
  chatStatus: "connecting",
  ...overrides,
});

describe("decideAutoConnect", () => {
  it("should return true when onboarding is ready and chat is connecting", () => {
    const result = decideAutoConnect(createInput());
    expect(result).toBe(true);
  });

  it("should return false when onboarding is not ready", () => {
    const result = decideAutoConnect(createInput({ onboardingStatus: "checking" }));
    expect(result).toBe(false);
  });

  it("should return false when chat is already connected", () => {
    const result = decideAutoConnect(createInput({ chatStatus: "connected" }));
    expect(result).toBe(false);
  });

  it("should return false when chat is disconnected", () => {
    const result = decideAutoConnect(createInput({ chatStatus: "disconnected" }));
    expect(result).toBe(false);
  });
});

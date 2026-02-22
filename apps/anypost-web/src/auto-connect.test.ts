import { describe, it, expect } from "vitest";
import { decideAutoConnect } from "./auto-connect.js";

type AutoConnectInput = {
  readonly onboardingStatus: string;
  readonly chatStatus: "connecting" | "connected" | "disconnected";
  readonly relayAddress: string;
};

const createInput = (overrides?: Partial<AutoConnectInput>): AutoConnectInput => ({
  onboardingStatus: "ready",
  chatStatus: "connecting",
  relayAddress: "/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooWTest",
  ...overrides,
});

describe("decideAutoConnect", () => {
  it("should return true when onboarding is ready, chat is connecting, and relay address exists", () => {
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

  it("should return false when relay address is empty", () => {
    const result = decideAutoConnect(createInput({ relayAddress: "" }));
    expect(result).toBe(false);
  });

  it("should return false when relay address is whitespace only", () => {
    const result = decideAutoConnect(createInput({ relayAddress: "   " }));
    expect(result).toBe(false);
  });
});

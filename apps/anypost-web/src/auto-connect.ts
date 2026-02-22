type AutoConnectInput = {
  readonly onboardingStatus: string;
  readonly chatStatus: "connecting" | "connected" | "disconnected";
  readonly relayAddress: string;
};

export const decideAutoConnect = (input: AutoConnectInput): boolean =>
  input.onboardingStatus === "ready" &&
  input.chatStatus === "connecting" &&
  input.relayAddress.trim().length > 0;

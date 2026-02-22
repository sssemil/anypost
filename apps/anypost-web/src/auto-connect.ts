type AutoConnectInput = {
  readonly onboardingStatus: string;
  readonly chatStatus: "connecting" | "connected" | "disconnected";
};

export const decideAutoConnect = (input: AutoConnectInput): boolean =>
  input.onboardingStatus === "ready" &&
  input.chatStatus === "connecting";

import { isValidPeerId } from "anypost-core/protocol";

type ConnectStatus = "idle" | "searching" | "connecting" | "connected" | "failed";

export type PeerSharingState = {
  readonly ownPeerId: string;
  readonly targetPeerId: string;
  readonly connectStatus: ConnectStatus;
  readonly errorMessage?: string;
  readonly copied: boolean;
};

export type ConnectEvent =
  | { readonly type: "search-started" }
  | { readonly type: "peer-found" }
  | { readonly type: "connected" }
  | { readonly type: "failed"; readonly errorMessage: string };

export const createPeerSharingState = (ownPeerId: string): PeerSharingState => ({
  ownPeerId,
  targetPeerId: "",
  connectStatus: "idle",
  errorMessage: undefined,
  copied: false,
});

export const setTargetPeerId = (
  state: PeerSharingState,
  targetPeerId: string,
): PeerSharingState => ({
  ...state,
  targetPeerId,
});

export const markCopied = (state: PeerSharingState): PeerSharingState => ({
  ...state,
  copied: true,
});

export const clearCopied = (state: PeerSharingState): PeerSharingState => ({
  ...state,
  copied: false,
});

export const transitionConnect = (
  state: PeerSharingState,
  event: ConnectEvent,
): PeerSharingState => {
  switch (state.connectStatus) {
    case "idle":
    case "failed":
      if (event.type === "search-started") {
        return { ...state, connectStatus: "searching", errorMessage: undefined };
      }
      return state;

    case "searching":
      if (event.type === "peer-found") {
        return { ...state, connectStatus: "connecting" };
      }
      if (event.type === "failed") {
        return { ...state, connectStatus: "failed", errorMessage: event.errorMessage };
      }
      return state;

    case "connecting":
      if (event.type === "connected") {
        return { ...state, connectStatus: "connected" };
      }
      if (event.type === "failed") {
        return { ...state, connectStatus: "failed", errorMessage: event.errorMessage };
      }
      return state;

    case "connected":
      return state;
  }
};

export const canConnect = (state: PeerSharingState): boolean =>
  (state.connectStatus === "idle" || state.connectStatus === "failed") &&
  isValidPeerId(state.targetPeerId);

import type { PeerId } from "../shared/schemas.js";

export const MAX_VIDEO_PEERS = 4;

type VideoCallState = {
  readonly peers: readonly PeerId[];
  readonly muted: boolean;
  readonly cameraEnabled: boolean;
};

export const createVideoCallState = (): VideoCallState => ({
  peers: [],
  muted: false,
  cameraEnabled: true,
});

export const addPeer = (
  state: VideoCallState,
  peerId: PeerId,
): VideoCallState => {
  if (state.peers.includes(peerId)) return state;
  if (state.peers.length >= MAX_VIDEO_PEERS) {
    throw new Error("Video call is full");
  }
  return { ...state, peers: [...state.peers, peerId] };
};

export const removePeer = (
  state: VideoCallState,
  peerId: PeerId,
): VideoCallState => ({
  ...state,
  peers: state.peers.filter((p) => p !== peerId),
});

export const setMuted = (
  state: VideoCallState,
  muted: boolean,
): VideoCallState => ({
  ...state,
  muted,
});

export const setCameraEnabled = (
  state: VideoCallState,
  cameraEnabled: boolean,
): VideoCallState => ({
  ...state,
  cameraEnabled,
});

export const getPeers = (state: VideoCallState): readonly PeerId[] =>
  state.peers;

export const isMuted = (state: VideoCallState): boolean => state.muted;

export const isCameraEnabled = (state: VideoCallState): boolean =>
  state.cameraEnabled;

import type { PeerId } from "../shared/schemas.js";

export const MAX_VOICE_PEERS = 8;

type VoiceCallState = {
  readonly peers: readonly PeerId[];
  readonly muted: boolean;
};

export const createVoiceCallState = (): VoiceCallState => ({
  peers: [],
  muted: false,
});

export const addPeer = (
  state: VoiceCallState,
  peerId: PeerId,
): VoiceCallState => {
  if (state.peers.includes(peerId)) return state;
  if (state.peers.length >= MAX_VOICE_PEERS) {
    throw new Error("Voice channel is full");
  }
  return { ...state, peers: [...state.peers, peerId] };
};

export const removePeer = (
  state: VoiceCallState,
  peerId: PeerId,
): VoiceCallState => ({
  ...state,
  peers: state.peers.filter((p) => p !== peerId),
});

export const setMuted = (
  state: VoiceCallState,
  muted: boolean,
): VoiceCallState => ({
  ...state,
  muted,
});

export const getPeers = (state: VoiceCallState): readonly PeerId[] =>
  state.peers;

export const isMuted = (state: VoiceCallState): boolean => state.muted;

export {
  MEDIA_SIGNAL_PROTOCOL,
  SignalMessageSchema,
  encodeSignalMessage,
  decodeSignalMessage,
} from "./signaling.js";

export type { SignalMessage } from "./signaling.js";

export {
  MAX_VOICE_PEERS,
  createVoiceCallState,
  addPeer as addVoicePeer,
  removePeer as removeVoicePeer,
  setMuted as setVoiceMuted,
  getPeers as getVoicePeers,
  isMuted as isVoiceMuted,
} from "./voice-call.js";

export {
  MAX_VIDEO_PEERS,
  createVideoCallState,
  addPeer as addVideoPeer,
  removePeer as removeVideoPeer,
  setMuted as setVideoMuted,
  setCameraEnabled,
  getPeers as getVideoPeers,
  isMuted as isVideoMuted,
  isCameraEnabled,
} from "./video-call.js";

export {
  createScreenShareState,
  startScreenShare,
  stopScreenShare,
  isSharing,
  getPreviousCameraEnabled,
} from "./screen-share.js";

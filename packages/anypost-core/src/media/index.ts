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
  addPeer,
  removePeer,
  setMuted,
  getPeers,
  isMuted,
} from "./voice-call.js";

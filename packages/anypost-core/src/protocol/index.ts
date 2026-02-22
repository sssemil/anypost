export { encodeWireMessage, decodeWireMessage } from "./codec.js";
export { createRouter, groupTopic, deviceDiscoveryTopic } from "./router.js";
export type { MessageHandler } from "./router.js";
export { createPlaintextChat } from "./plaintext-chat.js";
export type { PlaintextChat, ChatMessageEvent, PeerInfo, NetworkStatus, NetworkEvent } from "./plaintext-chat.js";
export { createInviteLink, parseInviteLink } from "./invite-link.js";
export type { InvitePayload } from "./invite-link.js";
export { createKeyPackageExchangeHandler, sendKeyPackage } from "./key-package-exchange.js";
export type {
  KeyPackageExchangeHandler,
  KeyPackageOffer,
  KeyPackageResponse,
} from "./key-package-exchange.js";
export {
  createPresenceTracker,
  recordHeartbeat,
  getOnlineMembers,
  isOnline,
  recordTypingStart,
  getTypingMembers,
  pruneExpired,
} from "./presence.js";
export {
  createConnectionState,
  transitionTo,
  connectionQuality,
} from "./connection-state.js";
export {
  createOutbox,
  createPendingMessage,
  confirmMessage,
  failMessage,
  getPendingMessages,
} from "./optimistic-send.js";
export {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  createBackoffState,
  recordFailure,
  recordSuccess,
  getNextDelay,
  getAttemptCount,
  applyJitter,
} from "./reconnect-backoff.js";
export {
  createSubscriptionTracker,
  addSubscription,
  removeSubscription,
  clearSubscriptions,
  getSubscriptions,
} from "./subscription-tracker.js";
export {
  DEFAULT_MESH_D,
  DEFAULT_MESH_D_LOW,
  DEFAULT_MESH_D_HIGH,
  DEFAULT_MESH_D_LAZY,
  FLOODSUB_PEER_THRESHOLD,
  createOpaqueTopicName,
  shouldUseFloodSub,
  createGossipSubParams,
} from "./gossipsub-config.js";
export {
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
  validateMessageSize,
} from "./message-validation.js";
export {
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_FAILURE_THRESHOLD,
  createRelayHealthState,
  recordHealthCheckSuccess,
  recordHealthCheckFailure,
  selectBestRelay,
  getRelayStatus,
  getHealthyRelayCount,
} from "./relay-health.js";

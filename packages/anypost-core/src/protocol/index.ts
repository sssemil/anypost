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
export type { RelayStatus, RelayEntry } from "./relay-health.js";
export {
  ANYPOST_RELAY_NAMESPACE,
  ANYPOST_CHAT_NAMESPACE,
  ANYPOST_GROUP_NAMESPACE_PREFIX,
  DEFAULT_TARGET_RELAY_POOL_SIZE,
  createProviderCid,
  createGroupProviderNamespace,
  createBrowserDhtConfig,
  createRelayDhtConfig,
} from "./dht-config.js";
export {
  createRelayPoolState,
  addRelay,
  removeRelay,
  needsMoreRelays,
  markDiscoveryStarted,
  markDiscoveryCompleted,
  getActiveRelayCount,
  selectBestRelays,
} from "./relay-pool.js";
export type { RelayPoolState } from "./relay-pool.js";
export {
  isValidPeerId,
  formatPeerIdShort,
  formatPeerIdForDisplay,
  formatSenderDisplay,
  buildCircuitRelayAddresses,
  extractRelayBaseAddress,
} from "./peer-id-sharing.js";
export {
  createMultiGroupState,
  transitionMultiGroup,
  getActiveGroup,
  getActiveMessages,
  getGroupList,
  getSeenPeerIds,
  getGroupMembers,
  hasGroup,
} from "./multi-group-state.js";
export type {
  GroupEntry,
  MultiGroupState,
  MultiGroupEvent,
} from "./multi-group-state.js";
export { startRelayPoolManager, discoverRelays } from "./relay-discovery.js";
export {
  createGroupDiscoveryState,
} from "./group-discovery-state.js";
export type {
  DiscoveredPeer,
  GroupDiscoveryEntry,
  GroupDiscoveryState,
} from "./group-discovery-state.js";
export { createGroupDiscoveryManager } from "./group-discovery.js";
export type { GroupDiscoveryManager } from "./group-discovery.js";
export { createMultiGroupChat } from "./multi-group-chat.js";
export type {
  MultiGroupChat,
  MultiGroupChatMessageEvent,
  JoinRequestEvent,
  DirectMessageRequestEvent,
  DiscoveryProfile,
  PeerDiscoveryMetrics,
  ConnectionMetrics,
  SyncPeerProgress,
  SyncProgressState,
  JoinRetryEntry,
  JoinRetryState,
} from "./multi-group-chat.js";
export {
  ActionPayloadSchema,
  ActionRoleSchema,
  SignableActionSchema,
  SignedActionEnvelopeSchema,
  GENESIS_HASH,
  toHex,
} from "./action-chain.js";
export type {
  ActionPayload,
  ActionRole,
  JoinPolicy,
  SignableAction,
  SignedAction,
  SignedActionEnvelope,
  GroupMember,
  ActionChainGroupState,
} from "./action-chain.js";
export {
  createSignedActionEnvelope,
  verifyAndDecodeAction,
} from "./action-signing.js";
export { JoinPolicySchema } from "./action-chain.js";
export {
  createActionDagState,
  appendAction,
  topologicalOrder,
  getTips,
} from "./action-dag.js";
export type { ActionDagState } from "./action-dag.js";
export {
  createActionChainGroupState,
  applyAction,
  deriveGroupState,
} from "./action-chain-state.js";
export { encodeGroupInvite, decodeGroupInvite } from "./group-invite.js";
export type { GroupInvite } from "./group-invite.js";
export {
  createInviteGrant,
  verifyInviteGrant,
  validateInviteGrantForJoin,
} from "./invite-grant.js";
export type {
  InviteGrantClaims,
  InviteGrantProof,
  InviteGrantPolicy,
} from "./invite-grant.js";
export {
  createRelayCandidateState,
  addCandidate as addRelayCandidate,
  removeCandidate as removeRelayCandidate,
  updateRtt as updateRelayRtt,
  markReservationActive,
  markReservationLost,
  getReservedCount,
  getCandidatesByRtt,
  getCandidateAddresses,
  DEFAULT_MAX_CANDIDATES,
} from "./relay-candidate-state.js";
export type {
  RelayCandidateEntry,
  RelayCandidateState,
} from "./relay-candidate-state.js";
export {
  createRelayReservationManager,
  DEFAULT_TARGET_ACTIVE_RELAYS,
} from "./relay-reservation-manager.js";
export type {
  RelayReservationState,
  RelayReservationEntry,
  RelayReservationStatus,
  RelayDialRequest,
  RelayDialReason,
} from "./relay-reservation-manager.js";
export {
  createJoinRetryState,
  enqueueJoinRetry,
  recordJoinRetryAttempt,
  scheduleNextJoinRetry,
  removeJoinRetry,
  markJoinRetryCancelled,
  dueJoinRetries,
  getJoinRetryDelayMs,
} from "./join-retry-queue.js";
export type {
  JoinRetryStatus,
} from "./join-retry-queue.js";

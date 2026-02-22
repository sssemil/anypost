export {
  generateAccountKey,
  accountKeyFromSeed,
  exportAccountKey,
  importAccountKey,
  generateDeviceKey,
  createDeviceCertificate,
  verifyDeviceCertificate,
} from "./identity.js";

export type { AccountKey, ExportedAccountKey } from "./identity.js";

export {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  addMember,
  joinFromWelcome,
  encryptMessage,
  processReceivedMessage,
  removeMember,
  updateKeys,
  getEpoch,
  getMemberCount,
} from "./mls-manager.js";

export type {
  AuthenticationService,
  MlsContext,
  MlsGroupState,
  MlsKeyPackageBundle,
  AddMemberResult,
  EncryptMessageResult,
  ProcessResult,
  RemoveMemberResult,
  UpdateKeysResult,
} from "./mls-manager.js";

export {
  createStewardState,
  processStewardProposal,
  getStewardMembers,
  createProposalQueue,
  enqueueProposal,
  drainProposalQueue,
} from "./steward.js";

export type {
  StewardProposal,
  StewardState,
  ProcessProposalResult,
  ProposalQueue,
  MemberRecord,
} from "./steward.js";

export {
  encryptContent,
  decryptContent,
  createMessageBuffer,
  bufferMessage,
  drainMessageBuffer,
} from "./encrypted-message-flow.js";

export type {
  BufferedMessage,
  MessageBuffer,
  DrainFailure,
} from "./encrypted-message-flow.js";

export {
  createRetentionConfig,
  createEpochTracker,
  recordEpoch,
  getExpiredEpochs,
  pruneTracker,
  pruneGroupState,
} from "./epoch-key-retention.js";

export type {
  RetentionConfig,
  EpochRecord,
  EpochTracker,
} from "./epoch-key-retention.js";

export {
  deviceMlsIdentity,
  addDeviceToGroups,
  removeDeviceFromGroups,
} from "./multi-device.js";

export type {
  AddDeviceToGroupsResult,
  RemoveDeviceFromGroupsResult,
} from "./multi-device.js";

export {
  STEWARD_HEARTBEAT_TIMEOUT_MS,
  createStewardFailoverState,
  recordStewardHeartbeat,
  isStewardOffline,
  electNewSteward,
  updateOnlineMembers,
  getCurrentSteward,
  getOnlineMembers,
} from "./steward-failover.js";

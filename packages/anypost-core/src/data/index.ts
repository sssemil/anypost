export {
  createGroupDocument,
  setGroupMetadata,
  getGroupMetadata,
  addMember,
  removeMember,
  getMembers,
  addChannel,
  getChannels,
  createChannelInGroup,
  deleteChannel,
  appendMessage,
  getChannelMessages,
  storePendingWelcome,
  getPendingWelcome,
  removePendingWelcome,
} from "./group-document.js";

export {
  createSettingsDocument,
  setDisplayName,
  getDisplayName,
  formatUserDisplay,
  setNotificationPreference,
  getNotificationPreferences,
} from "./settings-document.js";

export type {
  NotificationPreferenceKey,
  NotificationPreferences,
} from "../shared/schemas.js";

export {
  createPersistedGroupDocument,
  createPersistedSettingsDocument,
  openMessageContentStore,
  requestPersistentStorage,
} from "./persistence.js";

export type {
  PersistedGroupDocument,
  PersistedSettingsDocument,
  MessageContentStore,
} from "./persistence.js";

export { openAccountStore } from "./account-store.js";

export type { AccountStore } from "./account-store.js";

export { createYjsSyncProvider } from "./yjs-sync-provider.js";

export type {
  YjsSyncProvider,
  YjsSyncProviderOptions,
} from "./yjs-sync-provider.js";

export {
  createDeviceRegistryDocument,
  addDeviceToRegistry,
  removeDeviceFromRegistry,
  getRegisteredDevices,
  isDeviceRegistered,
  updateDeviceLastSeen,
} from "./device-registry.js";

export type { RegisteredDevice } from "./device-registry.js";

export {
  createStoragePersistenceState,
  recordPersistenceResult,
  getPersistenceStatus,
  isPersistenceGranted,
} from "./storage-persistence.js";

export {
  createMlsBackupTracker,
  recordBackup,
  markGroupNeedsBackup,
  getGroupsNeedingBackup,
  getLastBackupTime,
} from "./mls-state-backup.js";

export {
  detectStateLoss,
  createDataLossWarningState,
  recordWarningShown,
  hasWarningBeenShown,
} from "./state-loss-detector.js";

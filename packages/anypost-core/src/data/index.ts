export {
  createGroupDocument,
  setGroupMetadata,
  getGroupMetadata,
  addMember,
  removeMember,
  getMembers,
  addChannel,
  getChannels,
  appendMessage,
  getChannelMessages,
} from "./group-document.js";

export {
  createSettingsDocument,
  setDisplayName,
  getDisplayName,
  formatUserDisplay,
} from "./settings-document.js";

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

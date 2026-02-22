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
  MlsContext,
  MlsGroupState,
  MlsKeyPackageBundle,
  AddMemberResult,
  EncryptMessageResult,
  ProcessResult,
  RemoveMemberResult,
  UpdateKeysResult,
} from "./mls-manager.js";

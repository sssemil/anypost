import {
  createGroup,
  joinGroup,
  createCommit,
  createApplicationMessage,
  processMessage,
  generateKeyPackage,
  getCiphersuiteImpl,
  getGroupMembers,
  unsafeTestingAuthenticationService,
  defaultProposalTypes,
  defaultCredentialTypes,
  zeroOutUint8Array,
} from "ts-mls";
import type {
  CiphersuiteImpl,
  ClientState,
  KeyPackage,
  PrivateKeyPackage,
  MlsFramedMessage,
  Welcome,
  Proposal,
} from "ts-mls";

const DEFAULT_CIPHERSUITE =
  "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519" as const;

export type MlsContext = {
  readonly cipherSuite: CiphersuiteImpl;
};

export type MlsGroupState = {
  readonly clientState: ClientState;
};

export type MlsKeyPackageBundle = {
  readonly publicPackage: KeyPackage;
  readonly privatePackage: PrivateKeyPackage;
};

type AddMemberResult = {
  readonly newGroupState: MlsGroupState;
  readonly welcome: Welcome;
  readonly commit: MlsFramedMessage;
};

type EncryptMessageResult = {
  readonly newGroupState: MlsGroupState;
  readonly ciphertext: MlsFramedMessage;
};

type ProcessResult =
  | { readonly kind: "applicationMessage"; readonly newGroupState: MlsGroupState; readonly plaintext: Uint8Array }
  | { readonly kind: "commit"; readonly newGroupState: MlsGroupState };

type RemoveMemberResult = {
  readonly newGroupState: MlsGroupState;
  readonly commit: MlsFramedMessage;
};

type UpdateKeysResult = {
  readonly newGroupState: MlsGroupState;
  readonly commit: MlsFramedMessage;
};

const makeInternalContext = (context: MlsContext) => ({
  cipherSuite: context.cipherSuite,
  authService: unsafeTestingAuthenticationService,
});

export const initMlsContext = async (): Promise<MlsContext> => {
  const cipherSuite = await getCiphersuiteImpl(DEFAULT_CIPHERSUITE);
  return { cipherSuite };
};

type CreateKeyPackageOptions = {
  readonly context: MlsContext;
  readonly identity: Uint8Array;
};

export const createMlsKeyPackage = async (
  options: CreateKeyPackageOptions,
): Promise<MlsKeyPackageBundle> => {
  const credential = {
    credentialType: defaultCredentialTypes.basic,
    identity: options.identity,
  };

  const kp = await generateKeyPackage({
    credential,
    cipherSuite: options.context.cipherSuite,
  });

  return {
    publicPackage: kp.publicPackage,
    privatePackage: kp.privatePackage,
  };
};

type CreateMlsGroupOptions = {
  readonly context: MlsContext;
  readonly groupId: Uint8Array;
  readonly keyPackage: MlsKeyPackageBundle;
};

export const createMlsGroup = async (
  options: CreateMlsGroupOptions,
): Promise<MlsGroupState> => {
  const clientState = await createGroup({
    context: makeInternalContext(options.context),
    groupId: options.groupId,
    keyPackage: options.keyPackage.publicPackage,
    privateKeyPackage: options.keyPackage.privatePackage,
  });

  return { clientState };
};

type AddMemberOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly newMemberKeyPackage: KeyPackage;
};

export const addMember = async (
  options: AddMemberOptions,
): Promise<AddMemberResult> => {
  const addProposal: Proposal = {
    proposalType: defaultProposalTypes.add,
    add: { keyPackage: options.newMemberKeyPackage },
  };

  const result = await createCommit({
    context: makeInternalContext(options.context),
    state: options.groupState.clientState,
    extraProposals: [addProposal],
    ratchetTreeExtension: true,
  });

  result.consumed.forEach(zeroOutUint8Array);

  if (!result.welcome) {
    throw new Error("addMember did not produce a Welcome message");
  }

  return {
    newGroupState: { clientState: result.newState },
    welcome: result.welcome.welcome,
    commit: result.commit,
  };
};

type JoinFromWelcomeOptions = {
  readonly context: MlsContext;
  readonly welcome: Welcome;
  readonly keyPackage: MlsKeyPackageBundle;
};

export const joinFromWelcome = async (
  options: JoinFromWelcomeOptions,
): Promise<MlsGroupState> => {
  const clientState = await joinGroup({
    context: makeInternalContext(options.context),
    welcome: options.welcome,
    keyPackage: options.keyPackage.publicPackage,
    privateKeys: options.keyPackage.privatePackage,
  });

  return { clientState };
};

type EncryptMessageOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly plaintext: Uint8Array;
};

export const encryptMessage = async (
  options: EncryptMessageOptions,
): Promise<EncryptMessageResult> => {
  const result = await createApplicationMessage({
    context: makeInternalContext(options.context),
    state: options.groupState.clientState,
    message: options.plaintext,
  });

  result.consumed.forEach(zeroOutUint8Array);

  return {
    newGroupState: { clientState: result.newState },
    ciphertext: result.message,
  };
};

type ProcessReceivedMessageOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly message: MlsFramedMessage;
};

export const processReceivedMessage = async (
  options: ProcessReceivedMessageOptions,
): Promise<ProcessResult> => {
  const result = await processMessage({
    context: makeInternalContext(options.context),
    state: options.groupState.clientState,
    message: options.message,
  });

  if (result.kind === "applicationMessage") {
    result.consumed.forEach(zeroOutUint8Array);
    return {
      kind: "applicationMessage",
      newGroupState: { clientState: result.newState },
      plaintext: result.message,
    };
  }

  result.consumed.forEach(zeroOutUint8Array);
  return {
    kind: "commit",
    newGroupState: { clientState: result.newState },
  };
};

type RemoveMemberOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly memberIndex: number;
};

export const removeMember = async (
  options: RemoveMemberOptions,
): Promise<RemoveMemberResult> => {
  const removeProposal: Proposal = {
    proposalType: defaultProposalTypes.remove,
    remove: { removed: options.memberIndex },
  };

  const result = await createCommit({
    context: makeInternalContext(options.context),
    state: options.groupState.clientState,
    extraProposals: [removeProposal],
  });

  result.consumed.forEach(zeroOutUint8Array);

  return {
    newGroupState: { clientState: result.newState },
    commit: result.commit,
  };
};

type UpdateKeysOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
};

export const updateKeys = async (
  options: UpdateKeysOptions,
): Promise<UpdateKeysResult> => {
  const result = await createCommit({
    context: makeInternalContext(options.context),
    state: options.groupState.clientState,
  });

  result.consumed.forEach(zeroOutUint8Array);

  return {
    newGroupState: { clientState: result.newState },
    commit: result.commit,
  };
};

export const getEpoch = (groupState: MlsGroupState): bigint =>
  groupState.clientState.groupContext.epoch;

export const getMemberCount = (groupState: MlsGroupState): number =>
  getGroupMembers(groupState.clientState).length;

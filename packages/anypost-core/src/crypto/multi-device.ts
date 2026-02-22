import { processStewardProposal } from "./steward.js";
import type { StewardState } from "./steward.js";
import type { KeyPackage, Welcome, MlsFramedMessage } from "ts-mls";

type GroupAddEntry = {
  readonly stewardState: StewardState;
  readonly newDeviceKeyPackage: KeyPackage;
};

type GroupAddResult = {
  readonly newStewardState: StewardState;
  readonly welcome: Welcome;
  readonly commit: MlsFramedMessage;
};

export type AddDeviceToGroupsResult = {
  readonly results: readonly GroupAddResult[];
};

type AddDeviceToGroupsOptions = {
  readonly groups: readonly GroupAddEntry[];
  readonly newDeviceIdentity: Uint8Array;
  readonly senderIdentity: Uint8Array;
};

type GroupRemoveResult = {
  readonly newStewardState: StewardState;
  readonly commit: MlsFramedMessage;
};

export type RemoveDeviceFromGroupsResult = {
  readonly results: readonly GroupRemoveResult[];
};

type RemoveDeviceFromGroupsOptions = {
  readonly groups: readonly StewardState[];
  readonly deviceIdentity: Uint8Array;
  readonly senderIdentity: Uint8Array;
};

export const deviceMlsIdentity = (devicePeerId: string): Uint8Array =>
  new TextEncoder().encode(devicePeerId);

export const addDeviceToGroups = async (
  options: AddDeviceToGroupsOptions,
): Promise<AddDeviceToGroupsResult> => {
  const results: GroupAddResult[] = [];

  for (const group of options.groups) {
    const result = await processStewardProposal({
      state: group.stewardState,
      proposal: {
        kind: "add",
        keyPackage: group.newDeviceKeyPackage,
        identity: options.newDeviceIdentity,
      },
      senderIdentity: options.senderIdentity,
    });

    if (!result.welcomeMessage) {
      throw new Error("Add proposal did not produce a welcome message");
    }

    results.push({
      newStewardState: result.newState,
      welcome: result.welcomeMessage.welcome,
      commit: result.commitBroadcast.commit,
    });
  }

  return { results };
};

export const removeDeviceFromGroups = async (
  options: RemoveDeviceFromGroupsOptions,
): Promise<RemoveDeviceFromGroupsResult> => {
  const results: GroupRemoveResult[] = [];

  for (const stewardState of options.groups) {
    const result = await processStewardProposal({
      state: stewardState,
      proposal: {
        kind: "remove",
        identity: options.deviceIdentity,
      },
      senderIdentity: options.senderIdentity,
    });

    results.push({
      newStewardState: result.newState,
      commit: result.commitBroadcast.commit,
    });
  }

  return { results };
};

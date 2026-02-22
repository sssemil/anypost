import type { GroupId } from "../shared/schemas.js";

type DetectStateLossInput = {
  readonly knownGroupIds: readonly GroupId[];
  readonly availableMlsGroupIds: readonly GroupId[];
  readonly availableBackupGroupIds: readonly GroupId[];
};

type StateLossResult = {
  readonly groupsWithState: readonly GroupId[];
  readonly groupsRestorableFromBackup: readonly GroupId[];
  readonly groupsNeedingRejoin: readonly GroupId[];
};

export const detectStateLoss = (input: DetectStateLossInput): StateLossResult => {
  const mlsSet = new Set(input.availableMlsGroupIds);
  const backupSet = new Set(input.availableBackupGroupIds);

  const groupsWithState: GroupId[] = [];
  const groupsRestorableFromBackup: GroupId[] = [];
  const groupsNeedingRejoin: GroupId[] = [];

  for (const groupId of input.knownGroupIds) {
    if (mlsSet.has(groupId)) {
      groupsWithState.push(groupId);
    } else if (backupSet.has(groupId)) {
      groupsRestorableFromBackup.push(groupId);
    } else {
      groupsNeedingRejoin.push(groupId);
    }
  }

  return { groupsWithState, groupsRestorableFromBackup, groupsNeedingRejoin };
};

type DataLossWarningState = {
  readonly warningShown: boolean;
};

export const createDataLossWarningState = (): DataLossWarningState => ({
  warningShown: false,
});

export const recordWarningShown = (
  state: DataLossWarningState,
): DataLossWarningState => ({
  ...state,
  warningShown: true,
});

export const hasWarningBeenShown = (
  state: DataLossWarningState,
): boolean => state.warningShown;

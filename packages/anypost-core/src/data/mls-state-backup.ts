import type { GroupId } from "../shared/schemas.js";

type MlsBackupTracker = {
  readonly groupsNeedingBackup: readonly GroupId[];
  readonly lastBackupTimes: ReadonlyMap<GroupId, number>;
};

export const createMlsBackupTracker = (): MlsBackupTracker => ({
  groupsNeedingBackup: [],
  lastBackupTimes: new Map(),
});

export const markGroupNeedsBackup = (
  tracker: MlsBackupTracker,
  groupId: GroupId,
): MlsBackupTracker => {
  if (tracker.groupsNeedingBackup.includes(groupId)) return tracker;
  return {
    ...tracker,
    groupsNeedingBackup: [...tracker.groupsNeedingBackup, groupId],
  };
};

export const recordBackup = (
  tracker: MlsBackupTracker,
  groupId: GroupId,
  timestamp: number,
): MlsBackupTracker => ({
  ...tracker,
  groupsNeedingBackup: tracker.groupsNeedingBackup.filter((id) => id !== groupId),
  lastBackupTimes: new Map([...tracker.lastBackupTimes, [groupId, timestamp]]),
});

export const getGroupsNeedingBackup = (
  tracker: MlsBackupTracker,
): readonly GroupId[] => tracker.groupsNeedingBackup;

export const getLastBackupTime = (
  tracker: MlsBackupTracker,
  groupId: GroupId,
): number | null => tracker.lastBackupTimes.get(groupId) ?? null;

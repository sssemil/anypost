import { describe, it, expect } from "vitest";
import {
  detectStateLoss,
  createDataLossWarningState,
  recordWarningShown,
  hasWarningBeenShown,
} from "./state-loss-detector.js";
import type { GroupId } from "../shared/schemas.js";

const GROUP_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" as GroupId;
const GROUP_B = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22" as GroupId;
const GROUP_C = "c2ggcc99-9c0b-4ef8-bb6d-6bb9bd380a33" as GroupId;

describe("detectStateLoss", () => {
  it("should return empty result when all groups have MLS state", () => {
    const result = detectStateLoss({
      knownGroupIds: [GROUP_A, GROUP_B],
      availableMlsGroupIds: [GROUP_A, GROUP_B],
      availableBackupGroupIds: [],
    });

    expect(result.groupsWithState).toEqual([GROUP_A, GROUP_B]);
    expect(result.groupsRestorableFromBackup).toEqual([]);
    expect(result.groupsNeedingRejoin).toEqual([]);
  });

  it("should identify groups restorable from backup", () => {
    const result = detectStateLoss({
      knownGroupIds: [GROUP_A, GROUP_B],
      availableMlsGroupIds: [GROUP_A],
      availableBackupGroupIds: [GROUP_B],
    });

    expect(result.groupsWithState).toEqual([GROUP_A]);
    expect(result.groupsRestorableFromBackup).toEqual([GROUP_B]);
    expect(result.groupsNeedingRejoin).toEqual([]);
  });

  it("should identify groups needing rejoin when no MLS state and no backup", () => {
    const result = detectStateLoss({
      knownGroupIds: [GROUP_A, GROUP_B],
      availableMlsGroupIds: [],
      availableBackupGroupIds: [],
    });

    expect(result.groupsWithState).toEqual([]);
    expect(result.groupsRestorableFromBackup).toEqual([]);
    expect(result.groupsNeedingRejoin).toEqual([GROUP_A, GROUP_B]);
  });

  it("should categorize mixed state across groups", () => {
    const result = detectStateLoss({
      knownGroupIds: [GROUP_A, GROUP_B, GROUP_C],
      availableMlsGroupIds: [GROUP_A],
      availableBackupGroupIds: [GROUP_B],
    });

    expect(result.groupsWithState).toEqual([GROUP_A]);
    expect(result.groupsRestorableFromBackup).toEqual([GROUP_B]);
    expect(result.groupsNeedingRejoin).toEqual([GROUP_C]);
  });

  it("should return empty arrays for no known groups", () => {
    const result = detectStateLoss({
      knownGroupIds: [],
      availableMlsGroupIds: [],
      availableBackupGroupIds: [],
    });

    expect(result.groupsWithState).toEqual([]);
    expect(result.groupsRestorableFromBackup).toEqual([]);
    expect(result.groupsNeedingRejoin).toEqual([]);
  });

  it("should prefer MLS state over backup when both exist", () => {
    const result = detectStateLoss({
      knownGroupIds: [GROUP_A],
      availableMlsGroupIds: [GROUP_A],
      availableBackupGroupIds: [GROUP_A],
    });

    expect(result.groupsWithState).toEqual([GROUP_A]);
    expect(result.groupsRestorableFromBackup).toEqual([]);
    expect(result.groupsNeedingRejoin).toEqual([]);
  });
});

describe("data loss warning state", () => {
  it("should start with warning not shown", () => {
    const state = createDataLossWarningState();

    expect(hasWarningBeenShown(state)).toBe(false);
  });

  it("should record warning as shown", () => {
    const state = createDataLossWarningState();

    const updated = recordWarningShown(state);

    expect(hasWarningBeenShown(updated)).toBe(true);
  });

  it("should not mutate original on recordWarningShown", () => {
    const original = createDataLossWarningState();
    recordWarningShown(original);

    expect(hasWarningBeenShown(original)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  createMlsBackupTracker,
  recordBackup,
  markGroupNeedsBackup,
  getGroupsNeedingBackup,
  getLastBackupTime,
} from "./mls-state-backup.js";
import type { GroupId } from "../shared/schemas.js";

const GROUP_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" as GroupId;
const GROUP_B = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22" as GroupId;

describe("createMlsBackupTracker", () => {
  it("should start with no groups needing backup", () => {
    const tracker = createMlsBackupTracker();

    expect(getGroupsNeedingBackup(tracker)).toEqual([]);
  });
});

describe("markGroupNeedsBackup", () => {
  it("should add group to backup queue", () => {
    const tracker = createMlsBackupTracker();

    const updated = markGroupNeedsBackup(tracker, GROUP_A);

    expect(getGroupsNeedingBackup(updated)).toEqual([GROUP_A]);
  });

  it("should not duplicate groups", () => {
    let tracker = createMlsBackupTracker();
    tracker = markGroupNeedsBackup(tracker, GROUP_A);

    const updated = markGroupNeedsBackup(tracker, GROUP_A);

    expect(getGroupsNeedingBackup(updated)).toEqual([GROUP_A]);
  });

  it("should track multiple groups", () => {
    let tracker = createMlsBackupTracker();
    tracker = markGroupNeedsBackup(tracker, GROUP_A);
    tracker = markGroupNeedsBackup(tracker, GROUP_B);

    expect(getGroupsNeedingBackup(tracker)).toEqual([GROUP_A, GROUP_B]);
  });
});

describe("recordBackup", () => {
  it("should remove group from backup queue", () => {
    let tracker = createMlsBackupTracker();
    tracker = markGroupNeedsBackup(tracker, GROUP_A);
    tracker = markGroupNeedsBackup(tracker, GROUP_B);

    const updated = recordBackup(tracker, GROUP_A, 1000);

    expect(getGroupsNeedingBackup(updated)).toEqual([GROUP_B]);
  });

  it("should record backup timestamp for group", () => {
    let tracker = createMlsBackupTracker();
    tracker = markGroupNeedsBackup(tracker, GROUP_A);

    const updated = recordBackup(tracker, GROUP_A, 1000);

    expect(getLastBackupTime(updated, GROUP_A)).toBe(1000);
  });

  it("should return null for group never backed up", () => {
    const tracker = createMlsBackupTracker();

    expect(getLastBackupTime(tracker, GROUP_A)).toBe(null);
  });
});

describe("immutability", () => {
  it("should not mutate original on markGroupNeedsBackup", () => {
    const original = createMlsBackupTracker();
    markGroupNeedsBackup(original, GROUP_A);

    expect(getGroupsNeedingBackup(original)).toEqual([]);
  });

  it("should not mutate original on recordBackup", () => {
    let tracker = createMlsBackupTracker();
    tracker = markGroupNeedsBackup(tracker, GROUP_A);
    recordBackup(tracker, GROUP_A, 1000);

    expect(getGroupsNeedingBackup(tracker)).toEqual([GROUP_A]);
  });
});

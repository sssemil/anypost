# Self-Review #1

**Date**: 2026-02-22T15:20:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 0
- NIT: 0

## Findings

### [MAJOR] 1: Inconsistent schema-validation pattern — readBooleanPref uses typeof instead of Zod schema
**File**: `packages/anypost-core/src/data/settings-document.ts:55-61`
**Confidence**: 82

**Issue**:
The existing `getDisplayName` validates CRDT data via `UserProfileSchema.safeParse()`. The new `readBooleanPref` uses `typeof raw === "boolean"` instead. CRDT data is a trust boundary (synced from remote peers). Project guidelines require schemas at trust boundaries.

**Fix**: Add `NotificationPreferencesSchema` to schemas.ts, derive types from it, use `.safeParse()` in `getNotificationPreferences`.

---

### [MAJOR] 2: NotificationPreferences and NotificationPreferenceKey types not exported
**File**: `packages/anypost-core/src/data/settings-document.ts:30-36`
**Confidence**: 90

**Issue**:
Consumer code cannot name the return type of `getNotificationPreferences` or the key parameter of `setNotificationPreference`. Other modules export their domain types (RegisteredDevice, AccountStore, etc.).

**Fix**: Export types from settings-document.ts and re-export from index.ts.

---

## Verdict
NEEDS_FIXES

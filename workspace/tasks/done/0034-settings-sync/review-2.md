# Self-Review #2

**Date**: 2026-02-22T15:30:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1
- MINOR: 2
- NIT: 1

## Findings

### [MAJOR] 1: Missing write-time validation in setNotificationPreference
**File**: `packages/anypost-core/src/data/settings-document.ts:41-49`
**Confidence**: 85

**Issue**:
setDisplayName validates input via `UserProfileSchema.shape.displayName.parse(displayName)` before writing to CRDT. setNotificationPreference writes directly without validation. In a P2P CRDT system, invalid data written locally propagates to all peers. 3 of 4 review perspectives flagged this.

**Fix**: Add `NotificationPreferenceKeySchema.parse(key)` before writing, consistent with the setDisplayName pattern.

---

### [MINOR] 2: Missing test for corrupted CRDT data in notifications map
**File**: `packages/anypost-core/src/data/settings-document.test.ts`
**Confidence**: 90

**Issue**:
Other CRDT readers (getGroupMetadata, getMembers, getChannelMessages) have explicit tests for invalid data. getNotificationPreferences handles it correctly (safeParse + default fallback) but this behavior is untested.

---

### [MINOR] 3: NotificationPreferenceKeySchema can diverge from NotificationPreferencesSchema
**File**: `packages/anypost-core/src/shared/schemas.ts:123-141`
**Confidence**: 85

**Issue**:
The enum keys and object schema keys are maintained independently. Adding a key to one without the other causes silent failure. Could derive key type from schema instead.

---

### [NIT] 4: Import style uses inline type keyword instead of separate import type statement
**File**: `packages/anypost-core/src/data/settings-document.ts:3-8`
**Confidence**: 85

**Issue**:
Other data modules (group-document.ts, device-registry.ts) use separate `import type` statements from the same module. This uses inline `type` keyword.

---

## Verdict
NEEDS_FIXES

# Self-Review #1

**Date**: 2026-02-22T15:10:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1
- MINOR: 2
- NIT: 0

## Findings

### [MAJOR] 1: Self-DM creates Yjs/MLS state desync
**File**: `packages/anypost-core/src/group-management.ts:142-204`
**Confidence**: 85

**Issue**:
If `initiatorAccountPublicKey === recipientAccountPublicKey`, the second `addMember` overwrites the first in the Yjs map (since it uses accountPublicKey as key), resulting in 1 member in Yjs but 2 in MLS. State desync.

**Fix**:
Add guard: `if (options.initiatorAccountPublicKey === options.recipientAccountPublicKey) throw new Error("Cannot start a DM with yourself")`

---

### [MINOR] 2: Misleading test name
**File**: `packages/anypost-core/src/group-management.test.ts:289`
**Confidence**: 85

**Issue**:
Test "should encrypt DM messages for exactly 2 members" doesn't test encryption — it tests Yjs append/retrieve.

**Fix**:
Rename to "should store messages using the group doc guid as implicit DM channel"

---

### [MINOR] 3: No test verifying regular groups lack isDM
**File**: `packages/anypost-core/src/group-management.test.ts`
**Confidence**: 82

**Issue**:
No test confirms `createGroup` doesn't set `isDM`. If someone added it accidentally, no test would catch it.

**Fix**:
Add assertion in createGroup tests.

## Verdict
NEEDS_FIXES

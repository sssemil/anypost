# Self-Review #2

**Date**: 2026-02-22T11:15:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 0
- MINOR: 3
- NIT: 5

## Review #1 Fix Verification

Both fixes correctly applied:
1. **Test description** (was CRITICAL): Line 89 now reads "last 8 hex chars" — matches `hex.slice(-8)` and expected value `191a1b1c`.
2. **Write-side validation** (was MAJOR): `setDisplayName` validates via `UserProfileSchema.shape.displayName.parse()` before CRDT write, schema has `.max(100)`, wrapped in `doc.transact()`. Tests verify empty and overlength rejection.

## Findings

### [MINOR] 1: Duplicate "store" and "retrieve" tests exercise identical code path
**File**: `packages/anypost-core/src/data/settings-document.test.ts:28-44`
**Confidence**: 85

**Issue**: "should store display name" and "should retrieve display name" tests are structurally identical — both set a name and read it back. Only the string differs ("Alice" vs "Bob"). No additional behavior or code path exercised.

**Fix**: Remove the second test or replace with a genuinely different behavior test.

---

### [MINOR] 2: Missing boundary-exact max-length test
**File**: `packages/anypost-core/src/data/settings-document.test.ts`
**Confidence**: 75

**Issue**: Tests verify 101 chars is rejected but don't verify 100 chars is accepted. Classic off-by-one boundary that should be explicitly tested.

**Fix**: Add test: `setDisplayName(doc, "a".repeat(100))` should succeed.

---

### [MINOR] 3: Inconsistent IndexedDB key construction pattern
**File**: `packages/anypost-core/src/data/persistence.ts:40`
**Confidence**: 60

**Issue**: Group uses explicit `anypost:group:${groupId}`, settings uses `anypost:${doc.guid}` which indirectly produces `anypost:settings:...`. The settings key depends on guid format leaking into persistence naming. Functional but inconsistent construction pattern.

**Fix**: Consider explicit key: `anypost:settings:${bytesToHex(accountPublicKey)}` for consistency.

---

### [NIT] 4: `createUserProfile` factory defined but unused in tests
**File**: `packages/anypost-core/src/shared/factories.ts:104-110`
**Confidence**: 60

Factory follows the project pattern but is not exercised by any test. Will become useful when UserProfile grows.

---

### [NIT] 5: `formatUserDisplay` second test adds minimal value
**File**: `packages/anypost-core/src/data/settings-document.test.ts:95-99`
**Confidence**: 70

Pure formatting function with no branching — second test just uses different string with identical code path.

---

### [NIT] 6: No test for corrupted non-string CRDT data
**File**: `packages/anypost-core/src/data/settings-document.ts:21-28`
**Confidence**: 70

`getDisplayName` handles non-string values via `safeParse` returning null, but this defensive behavior isn't explicitly tested.

---

### [NIT] 7: No unicode/special character display name tests
**File**: `packages/anypost-core/src/data/settings-document.test.ts`
**Confidence**: 50

All tests use ASCII. Zero-width characters pass `.min(1)` despite being visually empty. Product decision, not a code defect.

---

### [NIT] 8: `UserProfileSchema` not tested in schemas.test.ts
**File**: `packages/anypost-core/src/shared/schemas.test.ts`
**Confidence**: 70

Existing convention tests each schema in schemas.test.ts. UserProfileSchema validation is covered indirectly via settings-document tests.

---

## Verdict
APPROVED

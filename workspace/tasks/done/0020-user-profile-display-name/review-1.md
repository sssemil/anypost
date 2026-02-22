# Self-Review #1

**Date**: 2026-02-22T10:58:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 1
- MINOR: 0
- NIT: 0

## Findings

### [CRITICAL] 1: Test description contradicts implementation for formatUserDisplay suffix length
**File**: `packages/anypost-core/src/data/settings-document.test.ts:76`
**Confidence**: 85

**Issue**:
The test description says "last 4 hex chars" but the implementation uses `hex.slice(-8)` producing 8 hex chars. The assertion expects `"Alice (..191a1b1c)"` which is 8 chars. 8 hex chars (4 bytes) is the correct design for disambiguation, but the test description is misleading.

**Fix**:
Update test description to match actual behavior: "last 8 hex chars of public key".

---

### [MAJOR] 2: `setDisplayName` accepts any string without validation
**File**: `packages/anypost-core/src/data/settings-document.ts:10-16`
**Confidence**: 85

**Issue**:
`setDisplayName` writes any string directly to Y.Map without validation. Empty strings and unbounded-length strings are accepted. Schema validation only happens on read. In a P2P app, this means invalid/oversized data can be written and synced. Missing `doc.transact()` for pattern consistency.

**Fix**:
- Add max-length constraint to `UserProfileSchema`
- Add write-side validation in `setDisplayName`
- Wrap in `doc.transact()`

---

## Verdict
NEEDS_FIXES

# Self-Review #1

**Date**: 2026-02-22T15:45:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1
- MINOR: 2
- NIT: 0

## Findings

### [MAJOR] 1: peerId typed as raw string instead of domain PeerId type
**File**: `packages/anypost-core/src/media/voice-call.ts:4,15,26,40`
**Confidence**: 93

**Issue**:
All 3 review perspectives flagged this. presence.ts and connection-state.ts use the PeerId branded type from schemas.ts. voice-call.ts uses raw string, losing compile-time type safety.

**Fix**: Import PeerId from schemas.ts and use throughout.

---

### [MINOR] 2: Tests use let for scoped state accumulation
**File**: `packages/anypost-core/src/media/voice-call.test.ts`
**Confidence**: 82

**Issue**: Uses `let state` pattern. However, this is the established pattern in presence.test.ts and connection-state.test.ts — scoped within individual tests, not shared between them.

---

### [MINOR] 3: Missing boundary test for exactly MAX_VOICE_PEERS accepted
**File**: `packages/anypost-core/src/media/voice-call.test.ts`
**Confidence**: 80

**Issue**: Tests verify overflow rejection but don't explicitly verify that the 8th peer is accepted.

---

## Verdict
NEEDS_FIXES

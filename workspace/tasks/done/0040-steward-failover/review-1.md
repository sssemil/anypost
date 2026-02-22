# Self-Review #1

**Date**: 2026-02-22T15:05:24Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 1
- MINOR: 0
- NIT: 0

## Findings

### [CRITICAL] 1: Missing applyNewSteward function — failover lifecycle incomplete
**File**: `packages/anypost-core/src/crypto/steward-failover.ts`
**Confidence**: 95

**Issue**:
The module tracks `currentSteward` in state but provides no function to update it after a successful election. The failover lifecycle is: detect offline → elect new steward → **apply new steward**. The third step is impossible via the public API. `createStewardFailoverState` sets `currentSteward` once; no function transitions it afterward.

**Code**:
```typescript
// Can elect a new steward...
const newSteward = electNewSteward(candidates);
// ...but cannot apply the result to state
// No function exists to update currentSteward
```

**Fix**:
Add `applyNewSteward` function that transitions state to a new steward, resets the heartbeat timer, and preserves online members. Write test first (TDD).

---

### [MAJOR] 2: Duplicate boundary test does not test actual boundary
**File**: `packages/anypost-core/src/crypto/steward-failover.test.ts:59-65`
**Confidence**: 90

**Issue**:
Test "should detect steward offline exactly at timeout boundary" uses `TIMEOUT_MS + 1` (same as "detect steward offline after timeout" at line 43). This is a duplicate, not a boundary test. The actual boundary (`TIMEOUT_MS` exactly) is already tested at line 51-57.

**Code**:
```typescript
// Line 43: "should detect steward offline after timeout"
isStewardOffline(state, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS + 1) // true

// Line 59: "should detect steward offline exactly at timeout boundary"
isStewardOffline(state, 1000 + STEWARD_HEARTBEAT_TIMEOUT_MS + 1) // true — SAME
```

**Fix**:
Remove the duplicate test. The boundary is already covered: `TIMEOUT_MS` → online (line 51), `TIMEOUT_MS + 1` → offline (line 43).

---

## Filtered Findings (False Positives)

- **Off-by-one `>` vs `>=`**: Design choice. At exactly 60s, steward is online. At 60s+1ms, offline. Consistent with `presence.ts` pattern.
- **Election re-elects failed node**: `electNewSteward` takes explicit `candidates` parameter — caller's responsibility to filter. This is the correct separation of concerns.
- **StewardFailoverState not exported**: Follows established codebase pattern (VoiceCallState, VideoCallState, ScreenShareState all unexported).
- **`let` in tests**: Established pattern in this codebase.

## Verdict
NEEDS_FIXES

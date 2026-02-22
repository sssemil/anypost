# Self-Review #1

**Date**: 2026-02-22T15:19:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 0
- NIT: 0

## Findings

### [MAJOR] 1: Weak cap test assertion allows broken capping to pass
**File**: `packages/anypost-core/src/protocol/reconnect-backoff.test.ts:46-58`
**Confidence**: 85

**Issue**:
Test uses `toBeLessThanOrEqual(5000)` instead of `toBe(5000)`. Also uses 5 failures where only 3 needed to prove the cap. A broken implementation returning any value ≤5000 would pass.

**Fix**: Use `toBe(5000)` with 3 failures (uncapped = 8000 > 5000, clearly exercises cap).

---

### [MAJOR] 2: No input validation — NaN/negative config silently causes reconnect storm
**File**: `packages/anypost-core/src/protocol/reconnect-backoff.ts:17-23`
**Confidence**: 85

**Issue**:
`createBackoffState` accepts config without validation. `NaN` or negative `baseDelayMs` causes `getNextDelay` to return `NaN` or negative, which `setTimeout` treats as 0ms — a tight reconnect loop. This is the exact failure mode the module is designed to prevent.

**Fix**: Add validation matching `epoch-key-retention.ts` pattern: throw `RangeError` for non-positive or non-finite values.

---

## Filtered
- Unbounded `attempts`: `Math.min` protects output. Not a real concern.
- Jitter: Will add a pure `applyJitter` helper to satisfy ticket requirement.

## Verdict
NEEDS_FIXES

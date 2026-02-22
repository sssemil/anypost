# Self-Review #1

**Date**: 2026-02-22T13:10:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 2
- MINOR: 1
- NIT: 0

## Findings

### [CRITICAL] 1: Epoch key material not zeroed on pruning
**File**: `epoch-key-retention.ts:89-104`
**Confidence**: 95

**Issue**: `pruneGroupState` merely filters the historicalReceiverData Map, dropping references to pruned EpochReceiverData entries. The underlying Uint8Array secrets (`resumptionPsk`, `senderDataSecret`) remain in memory. The codebase already uses `zeroOutUint8Array` throughout mls-manager.ts for exactly this purpose. Without zeroing, the forward secrecy claim is hollow.

**Fix**: Import `zeroOutUint8Array` from ts-mls and zero the Uint8Array fields on pruned EpochReceiverData entries before dropping them.

---

### [MAJOR] 2: `Number(bigint)` precision loss in sort comparator
**File**: `epoch-key-retention.ts:57`
**Confidence**: 90

**Issue**: `Number(b.epoch - a.epoch)` silently truncates when the bigint difference exceeds Number.MAX_SAFE_INTEGER. Use native bigint comparison instead.

**Fix**: `if (b.epoch > a.epoch) return 1; if (b.epoch < a.epoch) return -1; return 0;`

---

### [MAJOR] 3: No input validation on RetentionConfig values
**File**: `epoch-key-retention.ts:22-27`
**Confidence**: 90

**Issue**: `maxAgeDays: 0` or `maxEpochCount: 0` silently destroy all epoch keys. Negative values produce nonsensical behavior. This is a trust boundary.

**Fix**: Add validation that values are positive (maxAgeDays > 0, maxEpochCount >= 1).

---

### [MINOR] 4: `pruneGroupState` doesn't spread outer MlsGroupState
**File**: `epoch-key-retention.ts:98-103`
**Confidence**: 65

**Issue**: If MlsGroupState gains fields beyond `clientState`, the return statement will silently drop them. Spread the outer object for forward-compat.

**Fix**: `return { ...options.groupState, clientState: { ... } }`

---

## Verdict
NEEDS_FIXES

# Self-Review #2

**Date**: 2026-02-22T13:25:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1 (fixed)
- MINOR: 2
- NIT: 2

## Previous Review Fixes Verified
All 4 findings from review #1 were correctly applied:
1. Key material zeroing via zeroOutUint8Array (was CRITICAL)
2. Native bigint comparison in sort (was MAJOR)
3. RangeError validation on RetentionConfig (was MAJOR)
4. Spread outer MlsGroupState (was MINOR)

## Findings

### [MAJOR] 1: SecretTree key material not zeroed during pruning (FIXED)
**File**: `epoch-key-retention.ts:108-113`
**Confidence**: 85 (unanimous across all 4 review perspectives)

**Issue**: Only `resumptionPsk` and `senderDataSecret` were zeroed. `SecretTree` contains `intermediateNodes: Record<number, Uint8Array>` and per-leaf `GenerationSecret` with `secret: Uint8Array` and `unusedGenerations: Record<number, Uint8Array>` -- all cryptographic secrets for deriving per-message encryption keys.

**Fix Applied**: Added `zeroSecretTree` and `zeroGenerationSecret` helpers that walk the entire SecretTree structure and zero all Uint8Array values. Updated test to verify intermediate nodes and leaf node secrets are zeroed.

---

### [MINOR] 2: pruneGroupState mutates input via in-place zeroing
**File**: `epoch-key-retention.ts:108-114`
**Confidence**: 80

**Issue**: `zeroOutUint8Array` intentionally mutates the original buffers in-place. The function appears pure (returns new MlsGroupState) but corrupts the input's Uint8Array fields. This is the correct security behavior -- you WANT the bytes gone from that memory location.

**Status**: Accepted as inherent tension between security (must zero in-place) and immutability. The test explicitly validates this side-effect behavior.

---

### [MINOR] 3: Non-null assertions in test file
**File**: `epoch-key-retention.test.ts:317-328`
**Confidence**: 82

**Status**: Fixed as part of the MAJOR fix -- replaced `epochData!` with a guard clause that throws a descriptive error.

---

### [NIT] 4: Positional parameters on recordEpoch/getExpiredEpochs/pruneTracker
**Confidence**: 55

Existing pattern in the codebase (e.g., bufferMessage). Not blocking.

### [NIT] 5: DAYS_MS constant in test duplicates MS_PER_DAY from production
**Confidence**: 40

Module-private constant, test defines its own for constructing timestamps. Not a real issue.

## Verdict
APPROVED

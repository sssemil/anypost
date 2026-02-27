# Self-Review #1

**Date**: 2026-02-27T01:40:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 4
- MINOR: 3
- NIT: 0

## Findings

### [MAJOR] 1: Missing catch block for CBOR decode in handler
**File**: `block-fetch.ts:191`
**Confidence**: 85

**Issue**: `decode(raw.subarray())` throws on invalid CBOR before `safeParse` runs. No catch block in `handleStream` means the exception propagates into libp2p's stream dispatch. `key-package-exchange.ts` has a catch block for this exact scenario.

**Fix**: Add catch block or wrap decode in try-catch.

---

### [MAJOR] 2: No past-time bound on sentAt enables unbounded replay
**File**: `block-fetch.ts:139`
**Confidence**: 85

**Issue**: Only future clock skew checked. Captured signed requests can be replayed indefinitely.

**Fix**: Add `if (request.sentAt < currentTime - MAX_CLOCK_SKEW_MS)` check.

---

### [MAJOR] 3: Response schema missing .max() on missing array
**File**: `block-fetch.ts:39`
**Confidence**: 85

**Issue**: `missing` array has no upper bound. Should be capped at MAX_HASHES_PER_REQUEST (256).

**Fix**: `missing: z.array(Uint8ArraySchema).max(MAX_HASHES_PER_REQUEST)`

---

### [MAJOR] 4: No byte-length constraints on hashes/pubkey/signature
**File**: `block-fetch.ts:29-31`
**Confidence**: 88

**Issue**: Schema accepts arbitrary-length Uint8Array for fixed-size fields.

**Fix**: Add `.refine(v => v.length === 32)` for hashes/pubkey, `.refine(v => v.length === 64)` for signature.

---

### [MINOR] 5: CBOR overhead not accounted in size estimation
**File**: `block-fetch.ts:115-118`
**Confidence**: 82

**Issue**: Per-envelope size estimate doesn't include ~48 bytes of CBOR framing overhead.

---

### [MINOR] 6: No integration tests for handler/requester
**File**: `block-fetch.test.ts`
**Confidence**: 88

**Issue**: Handler and requester untested. Follows existing pattern (key-package-exchange has no tests either).

---

### [MINOR] 7: Silent error handling with no observability
**File**: `block-fetch.ts:188-212`
**Confidence**: 80

**Issue**: All handler error paths silently return. Consistent with security-first design.

---

## Verdict
NEEDS_FIXES

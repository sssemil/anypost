# Self-Review #1

**Date**: 2026-02-22T14:30:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 3
- MINOR: 0
- NIT: 0

## Findings

### [CRITICAL] 1: Unvalidated CBOR data at trust boundary
**File**: `protocol/key-package-exchange.ts:45,112`
**Confidence**: 95

**Issue**:
Both the handler (line 45) and sender (line 112) use `decode(...) as T` to cast CBOR-decoded network data without runtime validation. The project's own `codec.ts` validates with Zod after CBOR decode. A malicious peer can send arbitrary CBOR payloads that propagate through the system with incorrect types.

**Code**:
```typescript
const decoded = decode(raw.subarray()) as KeyPackageOffer;
return decode(raw.subarray()) as KeyPackageResponse;
```

**Fix**:
Add Zod schemas for `KeyPackageOffer` and `KeyPackageResponse` and validate at decode boundary.

---

### [MAJOR] 2: Internal error messages leaked to remote peers
**File**: `protocol/key-package-exchange.ts:49-54`
**Confidence**: 85

**Issue**:
When `onOffer` throws, the raw `error.message` is sent to the remote peer, potentially exposing implementation details.

**Fix**:
Send generic error message to remote peer.

---

### [MAJOR] 3: PSK falsy check silently drops empty strings
**File**: `protocol/invite-link.ts:29`
**Confidence**: 85

**Issue**:
`if (options.psk)` is falsy for empty string, silently discarding a PSK of `""` instead of including it or rejecting it.

**Fix**:
Use `if (options.psk !== undefined)` for explicit check.

---

### [MAJOR] 4: Missing test for malformed CBOR input
**File**: `protocol/key-package-exchange.test.ts`
**Confidence**: 88

**Issue**:
No test verifies behavior when a peer sends invalid/malformed CBOR data. This is the most likely failure mode in a P2P protocol.

**Fix**:
Add test for malformed input handling.

---

## Verdict
NEEDS_FIXES

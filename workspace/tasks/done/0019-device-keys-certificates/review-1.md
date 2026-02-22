# Self-Review #1

**Date**: 2026-02-22T10:40:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 1
- MINOR: 0
- NIT: 0

## Findings

### [CRITICAL] 1: Future timestamps bypass certificate expiry check
**File**: `packages/anypost-core/src/crypto/identity.ts:95`
**Confidence**: 90

**Issue**:
The expiry check `now - certificate.timestamp > maxAge` only rejects old certificates. A certificate with a far-future timestamp produces a large negative result, which is always less than maxAge, effectively making the certificate never expire. An attacker or misconfigured clock could exploit this.

**Fix**:
Add a clock skew guard before the expiry check:
```typescript
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
if (certificate.timestamp > now + CLOCK_SKEW_TOLERANCE_MS) {
  return false;
}
```

---

### [MAJOR] 2: `ed25519.verify` throws on malformed certificate data instead of returning false
**File**: `packages/anypost-core/src/crypto/identity.ts:105`
**Confidence**: 85

**Issue**:
`ed25519.verify` throws if signature is not 64 bytes or publicKey is not 32 bytes. `DeviceCertificateSchema` uses `z.instanceof(Uint8Array)` without length constraints. At the network trust boundary, malformed data would cause an unhandled exception in a function that callers expect to return a boolean.

**Fix**:
Wrap the verify call in try/catch returning false on error.

---

## Verdict
NEEDS_FIXES

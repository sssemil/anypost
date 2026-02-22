# Self-Review #1

**Date**: 2026-02-22T09:22:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 0
- NIT: 0

## Findings

### [MAJOR] 1: No test verifies the keypair is a valid ed25519 signing keypair
**File**: `packages/anypost-core/src/crypto/identity.test.ts:16-23`
**Confidence**: 85

**Issue**:
The test "generateAccountKey should produce an ed25519 keypair" only checks that publicKey and privateKey are Uint8Array of length 32. This would pass for any 32 random bytes. The test does not verify that the public key is derived from the private key, or that the keypair can be used for signing.

**Fix**:
Add a sign/verify round-trip assertion to prove the keypair is functional.

---

### [MAJOR] 2: `accountKeyFromSeed` is exported without explicit validation
**File**: `packages/anypost-core/src/crypto/identity.ts:25-28`
**Confidence**: 82

**Issue**:
`accountKeyFromSeed` is exported publicly but does not validate its input, unlike `importAccountKey` which explicitly checks `validateMnemonic` first. While `mnemonicToEntropy` throws on invalid input, the error message is a generic library error rather than the domain-appropriate "Invalid seed phrase".

**Fix**:
Add explicit validation to `accountKeyFromSeed` for consistency.

---

## Verdict
NEEDS_FIXES

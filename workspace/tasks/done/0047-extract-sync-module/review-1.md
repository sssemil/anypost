# Self-Review #1

**Date**: 2026-02-26T23:35:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 3
- MINOR: 2
- NIT: 3

## Findings

### [CRITICAL] 1: `dagHeadHash` non-deterministic tip selection in multi-tip DAGs
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:1474`
**Confidence**: 90

**Issue**: `getTips` iterates a `Set<string>` (insertion-order dependent). `tips[tips.length - 1]` picks the last-inserted tip, which differs across peers that received the same actions in different orders. This causes spurious sync cycles when both peers have identical DAG state but different tipHashes insertion orders.

**Fix**: Use `topologicalOrder` to get a deterministic result, matching the original `getLatestKnownHash` behavior.

---

### [MAJOR] 2: `verifySyncRequest`/`verifySyncResponse` can throw on malformed inputs
**File**: `packages/anypost-core/src/protocol/sync-protocol.ts:80,98`
**Confidence**: 90

**Issue**: `ed25519.verify` throws if signature/key has wrong byte length. Callers in multi-group-chat.ts have no try/catch, so a malformed network packet crashes the message handler.

**Fix**: Wrap in try/catch, return false on error.

---

### [MAJOR] 3: `new Uint8Array([...ed25519.sign(...)])` unnecessary allocation
**File**: `packages/anypost-core/src/protocol/sync-protocol.ts:72,90`
**Confidence**: 95

**Issue**: Spreads Uint8Array into Array<number> then re-wraps. Should use `new Uint8Array(ed25519.sign(...))` per the TS 5.9 Uint8Array pattern documented in MEMORY.md.

**Fix**: Replace `new Uint8Array([...ed25519.sign(...)])` with `new Uint8Array(ed25519.sign(...))`.

---

### [MAJOR] 4: Missing "wrong key" test for `verifySyncResponse`
**File**: `packages/anypost-core/src/protocol/sync-protocol.test.ts`
**Confidence**: 80

**Issue**: `verifySyncRequest` has a wrong-key rejection test but `verifySyncResponse` does not. Asymmetric coverage gap.

**Fix**: Add equivalent test.

---

### [MINOR] 5: `SyncRequestPayload`/`SyncResponsePayload` not exported
**File**: `packages/anypost-core/src/protocol/sync-protocol.ts:10,19`
**Confidence**: 80

### [MINOR] 6: `encodeSyncResponseSigningPayload` missing discriminability test
**File**: `packages/anypost-core/src/protocol/sync-protocol.test.ts`
**Confidence**: 75

### [NIT] 7: Constants test asserts exact values rather than behavioral relationships
### [NIT] 8: `createTestEnvelope` mutates Uint8Array after allocation
### [NIT] 9: Sign functions barrel-exported but are internal sync machinery

## Verdict
NEEDS_FIXES

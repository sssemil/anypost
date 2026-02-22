# Self-Review #1

**Date**: 2026-02-22T12:00:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 3
- MINOR: 1
- NIT: 0

## Findings

### [MAJOR] 1: Silent catch-all in drainMessageBuffer swallows all errors
**File**: `encrypted-message-flow.ts:123-125`
**Confidence**: 88

**Issue**: The bare `catch` block catches every exception and re-buffers the message. Corrupted messages, CBOR decode failures, schema validation errors are silently re-buffered forever, never evicted, never reported.

**Code**:
```typescript
} catch {
  remaining.push(buffered);
}
```

**Fix**: Add `failed` array to DrainBufferResult. Separate MLS decryption errors (retriable) from other errors (permanent).

---

### [MAJOR] 2: Plaintext not zeroed after encryption/decryption
**File**: `encrypted-message-flow.ts:22-27, 62`
**Confidence**: 82

**Issue**: mls-manager.ts consistently calls `zeroOutUint8Array` on consumed secrets. encryptContent leaves `contentBytes` in memory; decryptContent leaves `result.plaintext`. Inconsistent with established crypto layer hygiene.

**Fix**: Zero contentBytes after encryption and result.plaintext after decryption using `zeroOutUint8Array` from ts-mls.

---

### [MAJOR] 3: Test uses inline factory instead of shared createMessageContent
**File**: `encrypted-message-flow.test.ts:60-63`
**Confidence**: 80

**Issue**: `textContent()` factory bypasses schema validation. Project guidelines require tests use real schemas from shared locations.

**Fix**: Use `createMessageContent` from `../shared/factories.js`.

---

### [MINOR] 4: No test for MessageContent with attachments (Uint8Array round-trip)
**File**: `encrypted-message-flow.test.ts`
**Confidence**: 80

**Issue**: CBOR was chosen specifically for Uint8Array support in attachments, but no test verifies this round-trip works.

**Fix**: Add test encrypting/decrypting content with attachments containing Uint8Array data.

## Verdict
NEEDS_FIXES

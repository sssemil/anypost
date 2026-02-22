# Self-Review #2

**Date**: 2026-02-22T15:45:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 0
- MINOR: 5
- NIT: 4

## Review #1 Fix Verification

All 4 reviewers confirmed the fixes from review #1 are correctly applied:
1. CBOR trust boundary validation via Zod schemas — correct
2. Generic error message instead of internal error leak — correct
3. PSK `!== undefined` check — correct
4. Malformed CBOR test — correct

## Findings

### [MINOR] 1: Empty-string PSK creates create/parse asymmetry
**File**: `protocol/invite-link.ts:29`
**Confidence**: 85

**Issue**:
`psk: ""` passes `!== undefined` but fails `z.string().min(1)` in `InvitePayloadSchema`. Creating a link with empty PSK produces a link that `parseInviteLink` rejects.

**Disposition**: Low-impact edge case. `CreateInviteLinkOptions.psk` is `string | undefined`, and callers should not pass empty strings. The schema correctly rejects invalid PSKs on parse.

---

### [MINOR] 2: `KeyPackageExchangeHandlerOptions` not re-exported from barrel
**File**: `protocol/index.ts`
**Confidence**: 82

**Issue**:
The options type for `createKeyPackageExchangeHandler` is exported from the module but missing from `protocol/index.ts` barrel.

**Disposition**: Consistent with other options types in the codebase (e.g., `CreatePlaintextChatOptions` is also private). Can be added when consumers need it.

---

### [MINOR] 3: Read timeout concern on `sendKeyPackage`
**File**: `protocol/key-package-exchange.ts:123`
**Confidence**: 88

**Issue**:
`lp.read()` has no timeout — client could hang if peer never responds.

**Disposition**: Consistent with existing pattern in `yjs-sync-provider.ts`. Libp2p connection-level idle timeouts provide the safety net. `lpStream.read()` doesn't accept a signal option, so fix would require `Promise.race`.

---

### [MINOR] 4: Malformed CBOR test doesn't assert error message
**File**: `protocol/key-package-exchange.test.ts:171`
**Confidence**: 82

**Issue**:
Only checks `response.type === "error"`, not the message content.

---

### [MINOR] 5: No test for client receiving malformed server response
**File**: `protocol/key-package-exchange.test.ts`
**Confidence**: 82

**Issue**:
Client-side `KeyPackageResponseSchema.parse()` is correct but untested with garbage server responses.

---

### [NIT] 6-9: handler.stop() placement, missing transact(), raw! assertion, z.unknown() for MLS payloads

All consistent with existing codebase patterns. No action required.

## Verdict
APPROVED

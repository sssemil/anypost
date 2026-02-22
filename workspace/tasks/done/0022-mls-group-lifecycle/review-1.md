# Self-Review #1

**Date**: 2026-02-22
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 1
- MINOR: 5
- NIT: 0

## Findings

### [CRITICAL] 1: unsafeTestingAuthenticationService hardcoded with no injection path

**File**: `packages/anypost-core/src/crypto/mls-manager.ts:66-69`
**Confidence**: 95

**Issue**:
The `unsafeTestingAuthenticationService` from ts-mls accepts every credential without validation (`return true`). This is baked into production library code via `makeInternalContext` with no override mechanism. The `MlsContext` type only carries `cipherSuite` — there is no `authService` field and no parameter on `initMlsContext` to inject one.

This means any entity can forge credentials, join groups, and impersonate members. While the task acknowledges "production will need real auth service," the current design makes this structurally impossible without a breaking change to `MlsContext` (which is already exported as a public type).

**Code**:
```typescript
const makeInternalContext = (context: MlsContext) => ({
  cipherSuite: context.cipherSuite,
  authService: unsafeTestingAuthenticationService,
});
```

**Fix**:
Add `authService` to `MlsContext` and accept it as an optional parameter in `initMlsContext`. Tests explicitly pass the unsafe service; production callers will provide a real one:

```typescript
export type MlsContext = {
  readonly cipherSuite: CiphersuiteImpl;
  readonly authService: AuthenticationService;
};

export const initMlsContext = async (options?: {
  authService?: AuthenticationService;
}): Promise<MlsContext> => {
  const cipherSuite = await getCiphersuiteImpl(DEFAULT_CIPHERSUITE);
  return {
    cipherSuite,
    authService: options?.authService ?? unsafeTestingAuthenticationService,
  };
};

const makeInternalContext = (context: MlsContext) => ({
  cipherSuite: context.cipherSuite,
  authService: context.authService,
});
```

---

### [MAJOR] 2: Result types not exported from barrel — consumers cannot type return values

**File**: `packages/anypost-core/src/crypto/index.ts:27-31`
**Confidence**: 88

**Issue**:
The barrel export only exports `MlsContext`, `MlsGroupState`, and `MlsKeyPackageBundle`. But `addMember`, `encryptMessage`, `processReceivedMessage`, `removeMember`, and `updateKeys` all return types that are NOT exported: `AddMemberResult`, `EncryptMessageResult`, `ProcessResult`, `RemoveMemberResult`, `UpdateKeysResult`. Consumers cannot write explicit type annotations for these return values.

**Code**:
```typescript
export type {
  MlsContext,
  MlsGroupState,
  MlsKeyPackageBundle,
} from "./mls-manager.js";
```

**Fix**:
Export the result types from `mls-manager.ts` and re-export from `index.ts`:

```typescript
// In mls-manager.ts: change `type` to `export type` for all result types
// In index.ts: add to type exports
export type {
  MlsContext, MlsGroupState, MlsKeyPackageBundle,
  AddMemberResult, EncryptMessageResult, ProcessResult,
  RemoveMemberResult, UpdateKeysResult,
} from "./mls-manager.js";
```

---

### [MINOR] 3: ProcessResult maps ts-mls "newState" to "commit" — discards actionTaken field

**File**: `packages/anypost-core/src/crypto/mls-manager.ts:52-54, 213-217`
**Confidence**: 82

**Issue**:
The ts-mls `ProcessMessageResult` returns `kind: "newState"` with an `actionTaken` field distinguishing commits, proposals, and reinits. The wrapper maps all of these to `{ kind: "commit" }`, discarding the distinction.

In the steward model, all MLS state transitions ARE commits (the steward serializes proposals into commits), so this is architecturally consistent for v1. However, if external proposal handling is ever needed, this abstraction will need updating.

---

### [MINOR] 4: removeMember accepts raw memberIndex with no bounds validation

**File**: `packages/anypost-core/src/crypto/mls-manager.ts:220-246`
**Confidence**: 80

**Issue**:
The `memberIndex` parameter is passed directly to ts-mls with no bounds checking. Out-of-range, negative, or non-integer values will produce cryptic errors from ts-mls internals. The steward module (primary caller) should know valid indices, but a guard clause would improve the trust boundary.

---

### [MINOR] 5: makeInternalContext lacks explicit return type annotation

**File**: `packages/anypost-core/src/crypto/mls-manager.ts:66`
**Confidence**: 80

**Issue**:
The single translation layer between the public API and ts-mls internals has an inferred return type. If ts-mls changes its context shape, the mismatch would surface deep inside ts-mls calls rather than at the boundary.

---

### [MINOR] 6: Test ProcessResult narrowing pattern is inconsistent

**File**: `packages/anypost-core/src/crypto/mls-manager.test.ts:200-202, 292-294, 341-343`
**Confidence**: 82

**Issue**:
Three instances use `if (decResult.kind === "applicationMessage")` for TypeScript narrowing, while line 330-332 uses `if (bobAfterUpdate.kind !== "commit") throw new Error(...)`. The patterns should be consistent.

---

### [MINOR] 7: ProcessResult type definition uses inconsistent line formatting

**File**: `packages/anypost-core/src/crypto/mls-manager.ts:52-54`
**Confidence**: 80

**Issue**:
The union members are on single long lines (~105 chars) while every other type in the file uses multi-line formatting.

---

## Filtered Findings

- **Weak test assertions (toBeDefined)**: False positive — lifecycle tests validate objects through actual use (encrypt→decrypt, add→join). This IS behavior testing.
- **Consumed secrets not zeroed on error paths**: False positive — if ts-mls throws, no `result.consumed` exists. Wrapper can only zero what it receives.
- **No test for empty plaintext**: Nice to have, not blocking.
- **addMember throws bare Error**: Consistent with existing `identity.ts` pattern.
- **initMlsContext allocates ciphersuite on every call**: Premature optimization concern.

## Verdict
NEEDS_FIXES

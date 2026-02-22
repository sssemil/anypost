# Self-Review #1

**Date**: 2026-02-22
**Iteration**: 1 of 30

## Summary
- CRITICAL: 3
- MAJOR: 1
- MINOR: 6

## Findings

### [CRITICAL] 1: Display name never persisted to IndexedDB
**File**: `apps/anypost-web/src/App.tsx:113` and `apps/anypost-web/src/App.tsx:49`
**Confidence**: 95

**Issue**:
`createSettingsDocument` creates an ephemeral in-memory Y.Doc. The codebase has `createPersistedSettingsDocument` (in `persistence.ts`) that wraps the doc with IndexedDB persistence, but it is never used. The display name is set in-memory during onboarding, then lost on every page reload. On next load, a fresh Y.Doc returns `null` for `getDisplayName`.

**Code**:
```typescript
const settingsDoc = createSettingsDocument(state.accountKey.publicKey);
setDisplayName(settingsDoc, name);
```

**Fix**:
Use `createPersistedSettingsDocument` instead of `createSettingsDocument` for both reading and writing display name. Keep a reference for the component lifecycle.

---

### [CRITICAL] 2: Non-atomic key writes + inconsistent hasAccountKey
**File**: `packages/anypost-core/src/data/account-store.ts:47-50` and `packages/anypost-core/src/data/account-store.ts:52-54`
**Confidence**: 88

**Issue**:
`saveAccountKey` uses two separate IndexedDB `put` calls without a transaction. If the browser crashes between them, the store has a publicKey but no privateKey. `getAccountKey` returns null (requires both), but `hasAccountKey` returns true (checks only publicKey). This creates an irrecoverable inconsistent state. Same issue with `deleteAccountKey`.

**Code**:
```typescript
saveAccountKey: async (key: AccountKey) => {
  await db.put("account", new Uint8Array(key.publicKey), "publicKey");
  await db.put("account", new Uint8Array(key.privateKey), "privateKey");
},
```

**Fix**:
Use an IndexedDB transaction. Also fix `hasAccountKey` to check both keys or use `getAccountKey() !== null`.

---

### [CRITICAL] 3: Unhandled import errors via void+async pattern
**File**: `apps/anypost-web/src/App.tsx:90-107` and `apps/anypost-web/src/App.tsx:211`
**Confidence**: 87

**Issue**:
`handleImportAccount` is async. `importAccountKey` throws synchronously on invalid seed phrases. The async function wraps this throw into a rejected Promise. The caller uses `void handleImportAccount(phrase)` which discards the Promise. The `OnboardingScreen` try/catch only catches synchronous exceptions from calling the prop function — it cannot catch Promise rejections. The error surfaces as an unhandled promise rejection with no user feedback.

**Code**:
```typescript
onImportAccount={(phrase) => void handleImportAccount(phrase)}
```

**Fix**:
Wrap `handleImportAccount` body in try/catch, or make it synchronous up to the first potential throw.

---

### [MAJOR] 4: Type assertions violate project guidelines
**File**: `packages/anypost-core/src/data/account-store.ts:42-43` and `apps/anypost-web/src/App.tsx:225`
**Confidence**: 90

**Issue**:
Two type assertions without justification:
1. `as Uint8Array` in getAccountKey — bypasses the `Uint8Array | boolean` union type
2. `as Extract<OnboardingState, ...>` in JSX — can be replaced with a derived signal

**Fix**:
1. Use `instanceof Uint8Array` runtime check instead of assertion
2. Create a `backupPending()` derived signal

---

### [MINOR] 5: Seed phrase held in memory for entire app lifetime
**File**: `apps/anypost-web/src/App.tsx:29`
**Confidence**: 80

### [MINOR] 6: No UI component tests
**Files**: All three .tsx component files
**Confidence**: 85

### [MINOR] 7: `startChat` accepts unused `accountKey` parameter
**File**: `apps/anypost-web/src/App.tsx:138`
**Confidence**: 85

### [MINOR] 8: No error handling in onMount
**File**: `apps/anypost-web/src/App.tsx:40-67`
**Confidence**: 82

### [MINOR] 9: Repeated open/close of AccountStore
**File**: `apps/anypost-web/src/App.tsx` (4 locations)
**Confidence**: 80

### [MINOR] 10: Magic number 100 duplicated
**File**: `apps/anypost-web/src/onboarding/DisplayNamePrompt.tsx:17,47`
**Confidence**: 78

## Verdict
NEEDS_FIXES

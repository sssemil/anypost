# Self-Review #2

**Date**: 2026-02-22
**Iteration**: 2 of 30

## Summary
- CRITICAL: 1
- MAJOR: 2
- MINOR: 1

## Findings

### [CRITICAL] 1: handleImportAccount catch block silently swallows ALL errors
**File**: `apps/anypost-web/src/App.tsx:109-114`
**Confidence**: 92

**Issue**:
The try/catch in `handleImportAccount` catches all exceptions indiscriminately. The intended case is catching `importAccountKey` validation errors (invalid seed phrase). However, the same catch also swallows IndexedDB errors from `openAccountStore()` and `store.saveAccountKey()`. If storage fails, the user gets no feedback and the state machine never transitions — the user is silently stuck on the onboarding screen. The comment claims errors are "surfaced by the synchronous throw path in OnboardingScreen.handleImport" but this is incorrect for async error paths (IndexedDB failures happen after the synchronous return).

**Code**:
```typescript
const handleImportAccount = async (phrase: string) => {
    try {
      const accountKey = importAccountKey(phrase);
      // ... storage operations ...
    } catch {
      // Silently swallows ALL errors including IndexedDB failures
    }
  };
```

**Fix**:
Narrow the error handling. `importAccountKey` is synchronous — let it throw before entering the async storage path. Catch validation errors separately from storage errors, or re-throw non-validation errors.

---

### [MAJOR] 2: handleDisplayNameSet has no error handling and leaks resources on failure
**File**: `apps/anypost-web/src/App.tsx:117-132`
**Confidence**: 90

**Issue**:
`handleDisplayNameSet` has no try/catch. If `createPersistedSettingsDocument` or `setDisplayName` throws, the promise rejects unhandled. More critically, `persistedSettings.destroy()` is not protected by a `finally` block — if any operation between `createPersistedSettingsDocument` and `destroy()` throws, the persisted settings resource leaks (IndexedDB persistence stays open, Y.Doc not cleaned up). This is called via `void handleDisplayNameSet(name)`, so any rejection becomes an unhandled promise rejection.

**Code**:
```typescript
const handleDisplayNameSet = async (name: string) => {
    const persistedSettings = await createPersistedSettingsDocument(state.accountKey.publicKey);
    setDisplayName(persistedSettings.doc, name);
    setDisplayNameState(name);
    await persistedSettings.destroy();
    // No try/catch, no finally for destroy
  };
```

**Fix**:
Wrap in try/catch with try/finally for `persistedSettings.destroy()`.

---

### [MAJOR] 3: handleCreateAccount has no error handling
**File**: `apps/anypost-web/src/App.tsx:71-89`
**Confidence**: 88

**Issue**:
`handleCreateAccount` is async and called via `void handleCreateAccount()`. If `openAccountStore()` or `store.saveAccountKey()` throws (IndexedDB failure), the promise rejects unhandled. The user is stuck on the onboarding screen with no feedback. While `store.close()` is in a finally block (good), the overall function lacks error handling for the case where `openAccountStore()` itself fails.

**Code**:
```typescript
const handleCreateAccount = async () => {
    const accountKey = generateAccountKey();
    const exported = exportAccountKey(accountKey);
    setSeedPhrase(exported.seedPhrase);
    const store = await openAccountStore();
    try {
      await store.saveAccountKey(accountKey);
    } finally {
      store.close();
    }
    // No outer try/catch
  };
```

**Fix**:
Wrap the entire function body in try/catch.

---

### [MINOR] 4: Non-null assertions in tests
**File**: `apps/anypost-web/src/onboarding/onboarding-machine.test.ts`
**Confidence**: 78

**Issue**:
Test file may use non-null assertions (`!`) which is a form of type assertion that bypasses strict null checking. Project guidelines discourage type assertions.

**Fix**:
Use guard assertions or type narrowing instead.

---

## Verdict
NEEDS_FIXES

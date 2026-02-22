# Self-Review #3

**Date**: 2026-02-22
**Iteration**: 3 of 30

## Summary
- CRITICAL: 2
- MAJOR: 2
- MINOR: 3

## Findings

### [CRITICAL] 1: handleBackupConfirmed has no error handling — unhandled promise rejection
**File**: `apps/anypost-web/src/App.tsx:154-165`
**Confidence**: 92

**Issue**:
Every other async handler (`handleCreateAccount`, `handleImportAccount`, `handleDisplayNameSet`) wraps its entire body in try/catch. `handleBackupConfirmed` does not. If `openAccountStore()` or `store.setBackedUp()` throws, the promise rejects unhandled (caller uses `void handleBackupConfirmed()`). This was the exact pattern fixed in Review #2 for the other handlers but was missed here.

**Fix**:
Wrap entire function body in try/catch, consistent with other handlers.

---

### [CRITICAL] 2: Invalid seed phrase errors are silently swallowed — user gets no feedback
**File**: `apps/anypost-web/src/App.tsx:97-105` and `apps/anypost-web/src/onboarding/OnboardingScreen.tsx:19-23`
**Confidence**: 88

**Issue**:
When a user enters an invalid seed phrase, `importAccountKey(phrase)` throws synchronously inside the async `handleImportAccount`. The catch on line 101 swallows it and returns. The comment claims "OnboardingScreen surfaces this via its synchronous try/catch" but this is false — the `void` + async boundary means OnboardingScreen's try/catch on line 19 never fires. The user clicks Import and nothing happens.

**Fix**:
Import `importAccountKey` in `OnboardingScreen.tsx` and validate synchronously before calling the async prop. Remove the validation catch from `handleImportAccount` (it will never receive an invalid phrase).

---

### [MAJOR] 3: onMount has no error handling — user stuck on Loading forever
**File**: `apps/anypost-web/src/App.tsx:40-69`
**Confidence**: 88

**Issue**:
If `openAccountStore()` throws (before entering the try/finally), the async callback rejects unhandled. SolidJS `onMount` does not handle rejected promises. The app remains stuck on the "Loading..." screen with no recovery.

**Fix**:
Wrap entire onMount body in try/catch, fallback to `no-key-found` state.

---

### [MAJOR] 4: handleDisplayNameSet uses stale state snapshot across async boundary
**File**: `apps/anypost-web/src/App.tsx:130,142-147`
**Confidence**: 80

**Issue**:
`state` is captured at line 130, then used in `transition(state, ...)` at line 143 after multiple `await` points. Every other handler uses `onboardingState()` fresh at the transition point. This is inconsistent and introduces a latent bug.

**Fix**:
Use `onboardingState()` at the transition call site.

---

### [MINOR] 5: Seed phrase held in signal for entire app lifetime
**File**: `apps/anypost-web/src/App.tsx:29,47`
**Confidence**: 85

**Issue**:
Even for returning users who already backed up, the seed phrase is derived and stored. After backup confirmation, the signal is never cleared.

**Fix**:
Don't derive seed phrase for already-backed-up users. Clear after backup confirmation.

---

### [MINOR] 6: Unbounded message list growth
**File**: `apps/anypost-web/src/App.tsx:177-179`
**Confidence**: 75

### [MINOR] 7: Comments in catch blocks
**File**: `apps/anypost-web/src/App.tsx` (multiple locations)
**Confidence**: 70

## Verdict
NEEDS_FIXES

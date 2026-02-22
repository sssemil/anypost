# Self-Review #1

**Date**: 2026-02-22T09:15:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 4
- MINOR: 6
- NIT: 3

## Findings

### [MAJOR] 1: sendMessage has no error handling — unhandled promise rejection
**File**: `apps/anypost-web/src/App.tsx:46-63`
**Confidence**: 92

**Issue**: If `chat.sendMessage(text)` throws, the rejection propagates unhandled. `handleKeyDown` calls `sendMessage()` without await or catch. No user feedback on failure.

**Fix**: Wrap in try/catch, set status to disconnected on failure. Capture `chat` in a local const to eliminate the `chat!` non-null assertion.

---

### [MAJOR] 2: No listener removal mechanism + stop() doesn't clean up
**File**: `packages/anypost-core/src/protocol/plaintext-chat.ts:80,130-132,133-135`
**Confidence**: 90

**Issue**: `onMessage` adds listeners but never provides unsubscribe. `stop()` calls `node.stop()` but doesn't clear listeners or remove the pubsub event handler.

**Fix**: Return unsubscribe function from `onMessage`. In `stop()`, remove pubsub event listener, unsubscribe from topic, and clear listeners.

---

### [MAJOR] 3: ChatMessageEvent type not exported — knowledge duplication
**File**: `packages/anypost-core/src/protocol/plaintext-chat.ts:18-23` + `apps/anypost-web/src/App.tsx:5-10`
**Confidence**: 95

**Issue**: Structurally identical types (`ChatMessageEvent` and `ChatMessage`) represent the same domain concept. App.tsx redefines it because it's not exported.

**Fix**: Export `ChatMessageEvent` from plaintext-chat.ts and re-export from protocol/index.ts. Import in App.tsx.

---

### [MAJOR] 4: chat!.peerId non-null assertion fragile across await
**File**: `apps/anypost-web/src/App.tsx:56`
**Confidence**: 92

**Issue**: `chat!` is used after an `await` boundary. TypeScript can't guarantee `chat` hasn't been reassigned.

**Fix**: Capture in a local const after the guard clause. Fixed alongside finding 1.

---

### [MINOR] 5: vite/vite-plugin-solid in dependencies instead of devDependencies
**File**: `apps/anypost-web/package.json`
**Confidence**: 95

---

### [MINOR] 6: Orphaned index.ts alongside index.tsx
**File**: `apps/anypost-web/src/index.ts`
**Confidence**: 88

---

### [MINOR] 7: onCleanup with async callback not awaited by SolidJS
**File**: `apps/anypost-web/src/App.tsx:40-44`
**Confidence**: 85

---

### [MINOR] 8: Fixed 500ms waitFor delays in tests (fragile)
**File**: `plaintext-chat.test.ts`, `gossipsub-integration.test.ts`
**Confidence**: 82

---

### [MINOR] 9: Type assertions (as PubSub, as { topic, data }) without justification
**File**: `plaintext-chat.ts:79,84`
**Confidence**: 80

---

### [MINOR] 10: Mutable listeners array with .push()
**File**: `plaintext-chat.ts:80,131`
**Confidence**: 75

---

### [NIT] 11: TextDecoder allocated per message
### [NIT] 12: Magic UUID duplicated in test files
### [NIT] 13: No message length validation at trust boundary

## False Positives Filtered
- "Duplicate message display" — gossipsub's `emitSelf` defaults to false. Sender does NOT receive own messages via pubsub. Local append is correct and necessary.
- "Production code imports test factory" — factories.ts is shared infrastructure, not test-only code.

## Verdict
NEEDS_FIXES (4 MAJOR findings)

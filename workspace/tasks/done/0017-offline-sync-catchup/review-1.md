# Self-Review #1

**Date**: 2026-02-22T09:15:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 2
- MINOR: 2
- NIT: 0

## Findings

### [CRITICAL] 1: All `createMessageRef()` calls produce identical IDs, making ordering/identity assertions vacuous
**File**: `packages/anypost-core/src/data/offline-sync.integration.test.ts:76,84-85,95-97`
**Confidence**: 95

**Issue**:
The factory `createMessageRef()` uses a hardcoded `DEFAULT_MESSAGE_ID` when called without overrides. In the second test ("offline peer should see missed messages after reconnecting"), all three messages have the same `id`:

```typescript
const msg1 = createMessageRef();  // id: "c2ffbc99-..."
const msg2 = createMessageRef();  // id: "c2ffbc99-..." (SAME)
const msg3 = createMessageRef();  // id: "c2ffbc99-..." (SAME)
```

The assertions `expect(messagesB[1].id).toBe(msg2.id)` are tautologically true since all IDs match. The test cannot distinguish between correct sync and broken sync that duplicates or reorders messages.

**Fix**:
Provide unique IDs via overrides or `randomUUID()`:

```typescript
const msg1 = createMessageRef({ id: randomUUID() });
const msg2 = createMessageRef({ id: randomUUID() });
const msg3 = createMessageRef({ id: randomUUID() });
```

---

### [MAJOR] 2: Resource leak — `store` not closed if early lines throw in test 1
**File**: `packages/anypost-core/src/data/offline-sync.integration.test.ts:37-57`
**Confidence**: 82

**Issue**:
The `store` is opened on line 37 but the `try/finally` that calls `store.close()` doesn't begin until line 47. If `appendMessage`, `store.put`, or `first.destroy()` throws, the store leaks.

**Fix**:
Wrap the entire test body after store creation in try/finally:

```typescript
const store = await openMessageContentStore();
try {
  // ... entire test body ...
} finally {
  store.close();
}
```

---

### [MAJOR] 3: Provider `stop()` calls inside try block — leaked on assertion failure in tests 2 and 3
**File**: `packages/anypost-core/src/data/offline-sync.integration.test.ts:99-100,143`
**Confidence**: 80

**Issue**:
`providerA.stop()` and `providerB.stop()` are called inside the `try` block, not in `finally`. If any assertion before those lines fails, providers leak their event listeners (doc update handler, pubsub subscription, protocol handler).

**Fix**:
Move stop() calls into the finally block, before destroy/stop calls on the underlying resources.

---

### [MINOR] 4: Naming breaks `TEST_` prefix convention
**File**: `packages/anypost-core/src/data/offline-sync.integration.test.ts:31`
**Confidence**: 85

**Issue**:
Uses `CHANNEL_ID` but all other test files use `TEST_CHANNEL_ID` or `TEST_GROUP_ID` prefix convention.

**Fix**: Rename to `TEST_CHANNEL_ID`.

---

### [MINOR] 5: `createTestNode` and `wait` duplicated across 3 test files
**File**: `packages/anypost-core/src/data/offline-sync.integration.test.ts:16-29`
**Confidence**: 80

**Issue**:
Same knowledge (test libp2p node config) duplicated in `yjs-sync-provider.test.ts`, `gossipsub-integration.test.ts`, and this file. Pre-existing issue extended by this PR.

**Fix**: Extract to shared test utility. (Not blocking — pre-existing pattern.)

---

## Verdict
NEEDS_FIXES

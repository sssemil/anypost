# Self-Review #1

**Date**: 2026-02-22
**Iteration**: 1 of 30

## Summary
- CRITICAL: 2
- MAJOR: 3
- MINOR: 3
- NIT: 1

## Findings

### [CRITICAL] 1: Incomplete sync protocol — unidirectional only
**File**: `yjs-sync-provider.ts:92-114` and `yjs-sync-provider.ts:55-72`
**Confidence**: 92

**Issue**:
The y-protocols sync protocol is a bidirectional handshake. The current `syncWithPeer` only sends SyncStep1 (local state vector), reads one SyncStep2 response (remote's diff), and closes. It never allows the remote to send ITS SyncStep1 or replies with the local diff. Similarly, `handleSyncStream` only responds to the client's SyncStep1 but never sends its own.

This means `syncWithPeer(A)` pulls A's data to the caller, but A never receives the caller's data. If both peers diverged while offline, only one side catches up. Found by all 4 reviewers.

**Fix**: Implement full bidirectional handshake:
- Server: after SyncStep2 reply, also send own SyncStep1, then read client's SyncStep2
- Client: after reading SyncStep2, continue reading for server's SyncStep1 and reply with SyncStep2

---

### [CRITICAL] 2: Protocol handler collision with multiple groups on same node
**File**: `yjs-sync-provider.ts:13,80,89`
**Confidence**: 92

**Issue**:
The protocol string `/anypost/yjs-sync/1.0.0` is a static constant. `node.handle()` registers one handler per protocol. Multiple `YjsSyncProvider` instances on the same node (different groups) will overwrite each other's handlers. `stop()` unregisters for ALL groups. GossipSub topics already include groupId, but direct streams don't.

**Fix**: Include groupId in protocol string: `/anypost/yjs-sync/1.0.0/${groupId}`

---

### [MAJOR] 3: `handleSyncStream` never closes the stream and has no bounds
**File**: `yjs-sync-provider.ts:55-72`
**Confidence**: 85

**Issue**:
Unlike `syncWithPeer` (which closes in `finally`), the inbound stream handler never explicitly closes the stream. Also has no message size limit, no timeout, and no concurrency limit. A malicious or misbehaving peer could hold streams open indefinitely.

**Fix**: Add `finally { await stream.close().catch(() => {}); }` and set `maxDataLength` on lpStream.

---

### [MAJOR] 4: Type assertions (`as`) on network data violate guidelines
**File**: `yjs-sync-provider.ts:37,48`
**Confidence**: 85

**Issue**:
Two `as` casts: `node.services.pubsub as PubSub` (line 37) and `event.detail as { topic: string; data: Uint8Array }` (line 48). The second is on untrusted network data (trust boundary). Project guidelines: "No type assertions unless absolutely necessary."

**Fix**: Add runtime validation for PubSub and use a type guard for gossip message detail.

---

### [MAJOR] 5: All errors silently swallowed — zero observability
**File**: `yjs-sync-provider.ts:44,69-71`
**Confidence**: 84

**Issue**:
`.catch(() => {})` on publish (line 44) and bare `catch {}` in stream handler (lines 69-71) swallow ALL errors. Publish failures, protocol errors, corrupt data errors — all silently dropped. No way to diagnose sync failures.

**Fix**: Filter expected errors (stream close) from unexpected ones. At minimum log unexpected errors.

---

### [MINOR] 6: Tests use fixed `wait(500)` delays — flaky risk
**File**: `yjs-sync-provider.test.ts` (throughout)
**Confidence**: 80

Tests use 7 fixed 500ms delays for GossipSub propagation. Flaky on slow CI, wasteful on fast machines. Should use polling with timeout.

---

### [MINOR] 7: Missing provider.stop() in finally blocks for tests 2 and 3
**File**: `yjs-sync-provider.test.ts:63-95,97-130`
**Confidence**: 82

Tests 2 and 3 never call `stop()` on providers, unlike tests 1, 4, 5. Could leak handlers.

---

### [MINOR] 8: Mutable `let started` flag
**File**: `yjs-sync-provider.ts:35`
**Confidence**: 75

`let started = false` contradicts immutability guidelines, though pragmatic for closure state.

---

### [NIT] 9: TEST_GROUP_ID duplicated across test files
**File**: `yjs-sync-provider.test.ts:28`
**Confidence**: 70

Same UUID appears in group-document.test.ts and persistence.test.ts. Could share from factories.

---

## Verdict
NEEDS_FIXES

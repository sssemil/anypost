# Self-Review #1

**Date**: 2026-02-27T01:30:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 4
- NIT: 1

## Findings

### [MAJOR] 1: heads_announce handler has no membership check
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3732`
**Confidence**: 85

**Issue**:
The `heads_announce` handler verifies the signature but does not check if the sender is a member of the group. Any valid key pair can send a `heads_announce` for any group topic, which triggers a `publishSyncRequest` (line 3750). While the sync_request handler on the receiving end checks membership (line 3579-3602), the unauthenticated heads_announce still causes:
1. **Information leakage**: The triggered sync_request exposes the victim's `knownHeads` hashes on the topic
2. **Bandwidth amplification**: Each cheap heads_announce triggers a more expensive sync_request publish
3. **Rate limit consumption**: The triggered sync_request consumes the victim's outgoing sync request rate limit

Compare with the `signed_action` handler (line 3759+) which checks `isMembershipEnforcedGroup` and verifies membership before processing.

**Code**:
```typescript
if (wireMessage.type === "heads_announce") {
    const payload = wireMessage.payload;
    if (!verifyHeadsAnnounce(payload)) { /* ... */ return; }
    // ... resolves peer, checks own peer ...
    const dag = actionDags.get(matchedGroupId);
    if (!dag) return;
    // NO MEMBERSHIP CHECK before triggering sync request
    const announcedHeadHexes = new Set(payload.heads.map((h: Uint8Array) => toHex(h)));
    const missingHeads = findMissingHashes(dag, announcedHeadHexes);
    if (missingHeads.size > 0) {
      void publishSyncRequest(matchedGroupId, senderPeerId).catch(() => {});
```

**Fix**:
Add a membership check matching the pattern used by the `signed_action` handler:
```typescript
if (isMembershipEnforcedGroup(matchedGroupId)) {
  const groupState = actionChainStates.get(matchedGroupId);
  const senderPublicKeyHex = toHex(payload.senderPublicKey);
  if (!groupState?.members.has(senderPublicKeyHex)) return;
}
```

---

### [MAJOR] 2: No concurrency guard on runBlockFetchChase
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3723`
**Confidence**: 80

**Issue**:
`runBlockFetchChase` is launched fire-and-forget via `void runBlockFetchChase(...).catch(...)` from the sync_response handler (line 3723). If multiple sync responses arrive for the same group (e.g., from different peers, or rapid reconnects), multiple concurrent block fetch chases can run simultaneously for the same group. Each chase makes network requests (`fetchBlocks`), processes envelopes, and mutates the DAG — creating race conditions on `actionDags`, `actionEnvelopes`, and `actionChainStates`.

**Code**:
```typescript
if (missingHeads.size > 0) {
  void runBlockFetchChase(matchedGroupId, senderPeerId, missingHeads).catch((err) => {
    emit("sync", `Block fetch chase failed...`);
  });
}
```

**Fix**:
Add a `Set<string>` tracking active chases by `groupId:peerId` key. Skip if already running:
```typescript
const activeBlockFetchChases = new Set<string>();

// In runBlockFetchChase:
const chaseKey = `${groupId}:${remotePeerId}`;
if (activeBlockFetchChases.has(chaseKey)) return;
activeBlockFetchChases.add(chaseKey);
try {
  // ... existing chase logic ...
} finally {
  activeBlockFetchChases.delete(chaseKey);
}
```

---

### [MINOR] 3: O(N*M) getEnvelope linear scan in block fetch handler
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3926`
**Confidence**: 70

**Issue**:
The `getEnvelope` callback does a linear scan + `toHex` computation for each requested hash:
```typescript
getEnvelope: (groupId, hashHex) => {
  const envelopes = actionEnvelopes.get(groupId);
  if (!envelopes) return undefined;
  return envelopes.find((e) => toHex(e.hash) === hashHex);
},
```
For M requested hashes across N envelopes, this is O(N*M). Currently mostly dead code since `publishSyncResponse` sends all envelopes, but will matter when sync responses are optimized.

**Fix**:
Build a `Map<string, SignedActionEnvelope>` keyed by hashHex alongside `actionEnvelopes`, or compute the index lazily in the callback.

---

### [MINOR] 4: publishSyncResponse sends ALL envelopes with no size bound
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2254`
**Confidence**: 65

**Issue**:
`publishSyncResponse` sends all ordered envelopes via GossipSub (line 2254). GossipSub has a default max message size (~1MB). Each envelope is ~200-300 bytes, so the limit is roughly 3000-5000 envelopes. For groups exceeding this, the publish will silently fail.

This is a deliberate design decision documented in the review context (`collectInlineEnvelopes` fails on DAG branches). Acceptable for current scope but should be addressed when groups grow larger.

**Fix**:
No fix needed now. Future: re-introduce inline envelope optimization or fall back to block fetch for large responses.

---

### [MINOR] 5: theirHeads field naming is semantically inverted
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2263`
**Confidence**: 60

**Issue**:
In `publishSyncResponse`, the responder puts their OWN heads into the `theirHeads` field:
```typescript
theirHeads: ourHeads,
```
From the responder's perspective, "their" refers to the requester. But the field actually contains the responder's heads. The receiver (line 3718-3728) correctly uses `payload.theirHeads` as "the other peer's heads" which happens to work, but the naming is confusing.

**Fix**:
Naming issue in the wire protocol schema — changing would break compatibility. Document the convention or consider renaming to `responderHeads` in a future protocol version.

---

### [MINOR] 6: lastMergeTimestampByAuthor not cleared in stop()
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:650`
**Confidence**: 90

**Issue**:
`lastMergeTimestampByAuthor` (line 650) is a `Map<string, number>` that tracks merge rate limiting. It is never cleared in the `stop()` method (line 5280-5318), unlike `lastBuiltHeadByGroup` (line 5314). This is a minor memory leak if the MultiGroupChat instance is stopped but the containing object is retained.

**Code**:
```typescript
lastBuiltHeadByGroup.clear();
// lastMergeTimestampByAuthor is NOT cleared
```

**Fix**:
Add `lastMergeTimestampByAuthor.clear();` after `lastBuiltHeadByGroup.clear();` in `stop()`.

---

### [NIT] 7: Recursive processSignedAction for auto-merge
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2608`
**Confidence**: 40

**Issue**:
`processSignedAction` recursively calls itself to process the auto-merge envelope (line 2608). The recursion is bounded to one level by the `action.payload.type !== "merge"` guard (line 2597), so this is safe. But recursive calls to a function that mutates shared state (`actionDags`, `actionEnvelopes`, `actionChainStates`) can be surprising to future readers.

**Fix**:
No fix needed — the guard prevents infinite recursion. Could refactor to iterative if readability becomes a concern.

---

## Verdict
NEEDS_FIXES (2 MAJOR findings: membership check on heads_announce, concurrency guard on block fetch chase)

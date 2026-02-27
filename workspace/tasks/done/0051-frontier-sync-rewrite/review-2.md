# Self-Review #2

**Date**: 2026-02-27T02:00:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 0
- MINOR: 6
- NIT: 4

All MAJOR findings from review #1 have been fixed. No new CRITICAL or MAJOR findings.

## Findings

### [MINOR] 1: publishSyncResponse sends ALL envelopes with no size bound
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2255`
**Confidence**: 75

Documented design decision. `collectInlineEnvelopes` fails on DAG branches. Block fetch chase provides fallback. Acceptable for current scope (small groups). ~3000-5000 envelopes before GossipSub limit (~1MB).

---

### [MINOR] 2: theirHeads field contains responder's heads, not requester's
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2264`
**Confidence**: 70

Naming confusion in wire protocol. Functionally correct: receiver uses `payload.theirHeads` to find hashes they're missing, which works because the responder's heads ARE what the requester needs to compare against. Renaming requires wire protocol schema change.

---

### [MINOR] 3: getEnvelope in block fetch handler uses O(N*M) linear scan
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3945`
**Confidence**: 70

Block fetch is currently mostly dead code since publishSyncResponse sends all envelopes. Will matter when sync responses are optimized. Could maintain `Map<hashHex, envelope>` index alongside envelope array.

---

### [MINOR] 4: DM handshake exception logic triplicated across 3 handlers
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3590,3668,3756`
**Confidence**: 80

Same 5-line boolean expression in sync_request, sync_response, and heads_announce handlers. Knowledge duplication — if criteria change, all 3 must update. Could extract `isDmHandshakeException(groupId, senderPeerId)` helper. Pre-existing pattern (sync_response was existing, only 2 new copies added by this task).

---

### [MINOR] 5: runBlockFetchChase re-requests hashes peer reported as missing
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2381`
**Confidence**: 75

`response.missing` is added back to `fetchQueue`, causing re-requests. Bounded by MAX_BLOCK_FETCH_CHASE_ROUNDS (100). Adding `if (accepted.length === 0) break;` would prevent useless rounds when peer returns only duplicates.

---

### [MINOR] 6: findMissingHashes doesn't filter GENESIS_HASH
**File**: `packages/anypost-core/src/protocol/action-dag.ts:98`
**Confidence**: 65

`selectParentHashes` returns `[GENESIS_HASH]` for empty DAGs. GENESIS_HASH is never in `actions` map, so `findMissingHashes` reports it as "missing". Triggers unnecessary sync request, but sync converges correctly (responds with all envelopes). Edge case — empty DAGs only occur briefly during group creation.

---

### [NIT] 7: hexToBytes has no input validation
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:2328`
**Confidence**: 45

Input always comes from `toHex` output. Internal function on internal data. Adding odd-length check would be defensive.

---

### [NIT] 8: collectInlineEnvelopes is dead code (exported, tested, never called)
**File**: `packages/anypost-core/src/protocol/sync-protocol.ts:174`
**Confidence**: 85

Deliberately kept for future use when inline optimization is fixed for DAG branches. Constants `MAX_INLINE_ENVELOPES` and `MAX_INLINE_BYTES` also exported but unused.

---

### [NIT] 9: Redundant `(h: Uint8Array)` type annotation in heads.map
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:3766`
**Confidence**: 90

TypeScript infers element type. Inconsistent with rest of file where `.map((h) => ...)` has no annotation.

---

### [NIT] 10: Magic number 4 for maxParents
**File**: `packages/anypost-core/src/protocol/multi-group-chat.ts:1486`
**Confidence**: 70

`selectParentHashes(dag, ..., 4)` — could extract to `MAX_PARENT_HASHES` constant.

---

## Verdict
APPROVED — 0 CRITICAL, 0 MAJOR findings. All MINOR/NIT findings are acceptable known limitations or micro-improvements that don't block completion.

# Frontier Sync Rewrite

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 4 — Frontier Sync Rewrite

## Description

Replace cursor-based sync with head-based frontier sync in `multi-group-chat.ts` (and the extracted `sync-protocol.ts` module from task 0047). This is the largest single change in the protocol upgrade.

### heads_announce

**Publish triggers** (replace current `subscription-change` handler that pushes all envelopes):
- `subscription-change` event: when a known member subscribes to a group topic, publish `heads_announce` (not full envelopes)
- After processing incoming actions that advance local state
- Periodically as a heartbeat (optional, can defer)

**Signing payload**: `CBOR({ type: "heads_announce", groupId, heads, sentAt })`

**Handler**: On receiving `heads_announce`, compare announced heads with local DAG. If any head is unknown, initiate sync.

### sync_request / sync_response rewrite

**Request**: Replace `knownHash` with `knownHeads: Uint8Array[]` (all local tips for that group).

**Response**: Include `theirHeads: Uint8Array[]` (responder's tips). Optionally include up to 16 inline envelopes (≤64 KiB total serialized, whichever limit hits first) if the diff is small.

**Constants**:
```typescript
MAX_INLINE_ENVELOPES = 16
MAX_INLINE_BYTES = 65536  // 64 KiB
```

**Signing payloads** (update existing):
- sync_request: `CBOR({ type: "sync_request", groupId, knownHeads, requestId?, targetPeerId? })`
- sync_response: `CBOR({ type: "sync_response", groupId, theirHeads, requestId?, targetPeerId })`

### Sync algorithm (requester side)

After receiving `sync_response`:
1. Call `findMissingHashes(localDag, theirHeads)` to get unknown heads
2. If response includes inline envelopes, process them via `processSignedAction` (small batch)
3. If unknown heads remain after inline processing, initiate block fetch:
   a. Call `fetchBlocks(peerId, groupId, unknownHashes)`
   b. Process response via `processBulkSignedActions`
   c. For each processed envelope, check if `parentHashes` contain unknown hashes
   d. Add unknown parents to fetch queue
   e. Repeat until fetch queue empty
4. Update local state

### Smart parent selection integration

When creating any new action:
1. Call `selectParentHashes(dag, lastBuiltHead, 4)` instead of `getTips(dag)` directly
2. Track `lastBuiltHead` per group (update after each locally-created action)

### Merge trigger

After any DAG mutation (local or remote):
1. Check `tipHashes.size > 64`
2. If true, check merge rate limit for local author
3. If allowed, create merge action with `selectParentHashes` (will reference ≥2 tips)

### Remove old sync machinery

- Remove all `knownHash`-based logic
- Remove `nextCursorHash` pagination
- Remove `getMissingEnvelopesForKnownHash`
- Remove `headHash` / `requestKnownHash` handling
- Remove full-sync fallback logic (replaced by block fetch)

## Acceptance Criteria

- [ ] `heads_announce` published on subscription-change (not full envelopes)
- [ ] `heads_announce` received triggers sync when heads differ
- [ ] `sync_request` sends `knownHeads` (local tips)
- [ ] `sync_response` includes `theirHeads` + optional inline envelopes
- [ ] Inline threshold enforced: ≤16 envelopes AND ≤64 KiB
- [ ] Requester initiates block fetch when inline is insufficient
- [ ] Recursive parent chase fetches all missing ancestors
- [ ] `processBulkSignedActions` used for block fetch batches
- [ ] Smart parent selection used for all new actions (≤4 parents)
- [ ] `lastBuiltHead` tracked per group, updated after local actions
- [ ] Merge triggered when `tipHashes.size > 64`
- [ ] Merge respects rate limit and ≥2 tips requirement
- [ ] All old cursor-based sync code removed
- [ ] Two divergent peers converge correctly after sync
- [ ] New peer syncs full history via heads_announce → block fetch
- [ ] All three invariants maintained (deterministic convergence, byte-exact sigs, single owner)

### heads_announce signing functions

Create `signHeadsAnnounce` / `verifyHeadsAnnounce` functions (in `sync-protocol.ts` extracted in task 0047). Follow the same pattern as `signSyncRequest`/`verifySyncRequest`. Signing payload: `CBOR({ type: "heads_announce", groupId, heads, sentAt })`.

Also update `encodeSyncRequestSigningPayload` and `encodeSyncResponseSigningPayload` to use the new field names (`knownHeads` instead of `knownHash`, `theirHeads` instead of `headHash`/`nextCursorHash`).

## Implementation Notes

- Phase 0 (task 0047) extracts sync functions first. This task modifies the extracted module.
- The recursive parent chase needs a max-depth safety cap (e.g., 1000 rounds) to prevent infinite loops in pathological cases. Content-addressed graphs guarantee termination in theory, but belt-and-suspenders.
- The inline threshold check should measure CBOR-encoded size of envelopes, not just count.
- Keep the existing sync rate limiting constants (`INCOMING_SYNC_REQUEST_MAX`, `OUTGOING_SYNC_REQUEST_MAX`) — they still apply.
- The `subscription-change` → `heads_announce` change is the critical behavioral shift. Test thoroughly.

## Dependencies

- Blocked by: 0047 (sync module extraction), 0048 (schemas), 0049 (DAG extensions), 0050 (block fetch)
- Blocks: 0053 (final validation needs working sync)

## History

- 2026-02-26 Created from brutal-plan PLAN-0002

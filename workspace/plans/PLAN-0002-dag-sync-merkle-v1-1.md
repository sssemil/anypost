# PLAN-0002: DAG Sync & Merkle Improvements (Protocol v1.1)

**Created**: 2026-02-26
**Status**: Ready for implementation

## Summary

Protocol v1.1 is a clean-break upgrade to Anypost's action chain protocol that replaces cursor-based sync with frontier (head-set) sync, introduces a direct block fetch stream protocol for bulk history transfer, bounds parent references to 4 with a new merge action type, replaces UUID action references with content-hash references, and gates all changes behind topic prefix + protocolVersion field.

## Requirements

### Sync Protocol
- Replace `knownHash` cursor sync with `knownHeads`/`theirHeads` head-set exchange
- Sync response always includes `theirHeads`; optionally includes up to 16 inline envelopes (≤64 KiB)
- Requester decides whether to use block fetch based on head comparison
- `heads_announce` wire message for lightweight frontier announcements

### Block Fetch Protocol
- New `/anypost/blocks/1.0.0/get` libp2p stream protocol
- Request: `{ groupId, hashes (max 256), senderPublicKey, signature, sentAt }`
- Response: `{ envelopes (max 256, ≤1 MiB), missing }`
- Signed request with CBOR payload; membership check before serving
- Reject if `sentAt` too far in future

### Bounded Parents & Merge
- `maxParents = 4` enforced in schema and processing
- Smart parent selection: last-built head + up to 3 oldest tips
- New `merge` action type (14th payload variant, empty payload)
- Merge rules: any member, ≥2 current tips, rate limit 1/min per author
- Merge triggered opportunistically when `tipHashes.size > 64`

### Hash References
- `message-edited.targetActionId` → `message-edited.targetHash: Uint8Array(32)`
- `message-deleted.targetActionId` → `message-deleted.targetHash: Uint8Array(32)`
- `read-receipt.upToActionId` → `read-receipt.upToHash: Uint8Array(32)`
- `readReceipts` state: `Map<authorHex, upToHashHex>`

### Protocol Gating
- Topic prefix: `anypost2/group/{groupId}`
- `protocolVersion: 2` in `SignableAction` (inside signedBytes)
- `protocolVersion: 2` on all group-scoped wire messages: `signed_action`, `sync_request`, `sync_response`, `heads_announce`, `join_request`, `join_request_direct`

### Web App Changes
- `canonicalMessagesByHash` index for edit/delete/read-receipt resolution
- Messages carry hash from SignedAction; edit/delete handlers receive hash directly
- `readReceipts` resolved via `canonicalMessagesByHash` or `hashToTopoIndex` map
- Clear v1.0 persisted data on upgrade (localStorage migration)

## Scope

### In Scope
- Sync protocol rewrite (frontier-based)
- `/anypost/blocks/1.0.0/get` stream protocol with auth
- `heads_announce` wire message
- `maxParents = 4` enforcement + smart parent selection
- `merge` action type (14th payload variant)
- Hash-only references for edit/delete/read-receipt
- Protocol gating (topic prefix + version field)
- Web app indexing changes for hash references
- `processBulkSignedActions` batch path for block fetch
- v1.0 localStorage data migration (clear on upgrade)
- PROTOCOL.md update

### Out of Scope
- Encryption/E2EE/MLS
- Identity/key system changes
- Relay architecture changes
- DHT/discovery redesign
- New moderation/anti-spam (beyond caps for block fetch + merge)
- UI features (no new screens, threading, reactions, search)
- Schema refactors unrelated to breaking changes
- Backward compatibility with v1.0

## Anti-Goals
- No encryption or MLS work
- No relay architecture changes or store peers
- No new UI features
- No schema refactors beyond required breaking changes
- No backward compatibility layer — clean break

## Non-Negotiables
1. **Deterministic convergence**: Same action set → same topo order → same derived state, regardless of delivery order
2. **Byte-exact signature integrity**: Verify against exact `signedBytes`, never re-encode
3. **Single-owner invariant**: Exactly one owner after every state transition

## Design

### Architecture

The changes span three layers:

**Protocol layer** (`packages/anypost-core/src/protocol/`):
- Schema changes: `action-chain.ts` (SignableAction + ActionPayload variants), `schemas.ts` (wire messages)
- New modules: `sync-protocol.ts` (extracted sync machinery), `block-fetch.ts` (stream protocol handler)
- Modified modules: `action-dag.ts` (new functions), `action-chain-state.ts` (merge handler + state fields), `action-signing.ts` (protocolVersion), `router.ts` (topic prefix + heads_announce handler)
- Modified integration: `multi-group-chat.ts` (sync rewrite, parent selection, merge trigger)

**Web app layer** (`apps/anypost-web/`):
- `App.tsx`: hash indexes, edit/delete/read-receipt API changes, localStorage migration
- Info panels: hash display instead of UUID

**Relay layer** (`apps/anypost-relay/`):
- Minimal: topic prefix change, block fetch handler registration

### Data Model

**`SignableAction` (inside signedBytes)**:
```
protocolVersion: 2       // NEW
id: UUID
groupId: UUID
authorPublicKey: Uint8Array(32)
timestamp: number
parentHashes: Uint8Array(32)[]  // max 4
payload: ActionPayload
```

**New `ActionPayload` variant**:
```
{ type: "merge" }  // 14th variant, no other fields
```

**Updated variants**:
```
message-edited:  { targetHash: Uint8Array(32), newText: string }
message-deleted: { targetHash: Uint8Array(32) }
read-receipt:    { upToHash: Uint8Array(32) }
```

**New `ActionChainGroupState` fields**:
```
readReceipts: ReadonlyMap<string, string>  // authorHex → upToHashHex (was UUID)
lastMergeTimestampByAuthor: ReadonlyMap<string, number>  // for rate limiting
```

**New per-group tracking** (in multi-group state or chat layer):
```
lastBuiltHead: Uint8Array | null  // per group, for smart parent selection
```

### API Surface

**New wire messages** (all with `protocolVersion: 2`):

`heads_announce`:
```
{ type: "heads_announce", protocolVersion: 2,
  payload: { groupId, heads (max 64), approxDagSize?, sentAt,
             senderPeerId, senderPublicKey, signature } }
```

**Modified wire messages** (all gain `protocolVersion: 2`):

`sync_request`: `knownHash` → `knownHeads: Uint8Array[]`
`sync_response`: Remove `requestKnownHash`, `headHash`, `nextCursorHash`. Add `theirHeads: Uint8Array[]`. Keep `envelopes` (max 16, ≤64 KiB).
`signed_action`: Add `protocolVersion: 2`
`join_request` / `join_request_direct`: Add `protocolVersion: 2`

**New stream protocol** `/anypost/blocks/1.0.0/get`:

Request (CBOR, signed):
```
{ protocolVersion: 2, type: "getBlocks", groupId, hashes (max 256),
  senderPublicKey, signature, sentAt }
```
Response (CBOR):
```
{ envelopes (max 256, ≤1 MiB), missing: Uint8Array[] }
```

### Sync Algorithm

**Head exchange flow**:
1. Peer A sends `heads_announce` (on subscription-change, reconnect, or periodically)
2. Peer B compares announced heads with local DAG
3. If heads differ, Peer B sends `sync_request` with own `knownHeads`
4. Peer A responds with `theirHeads` + optional inline envelopes (≤16, ≤64 KiB)
5. Peer B computes missing hashes (optimistic: their heads not in local DAG)
6. If missing > 0, Peer B fetches via `/anypost/blocks/1.0.0/get`
7. Recursive parent chase: for each fetched envelope, queue unknown parents
8. After all blocks received, `processBulkSignedActions` derives state once

**Inline threshold constants**:
```
MAX_INLINE_ENVELOPES = 16
MAX_INLINE_BYTES = 65536  // 64 KiB
```

### Signing Payloads

**heads_announce**: `CBOR({ type: "heads_announce", groupId, heads, sentAt })`
**sync_request**: `CBOR({ type: "sync_request", groupId, knownHeads, requestId?, targetPeerId? })`
**sync_response**: `CBOR({ type: "sync_response", groupId, theirHeads, requestId?, targetPeerId })`
**block fetch request**: `CBOR({ protocolVersion: 2, type: "getBlocks", groupId, hashes, sentAt })`

### Parent Selection Algorithm

```
1. Include lastBuiltHead (the tip advanced by local peer's previous action)
2. Add up to 3 more tips, selected oldest-first by (timestamp, hash)
3. Total ≤ 4 parents
4. If no lastBuiltHead (first action), select up to 4 oldest tips
```

### Merge Action Rules

```
- Any member can emit
- Must reference ≥2 current tips (validated in processSignedAction with DAG access)
- Rate limit: 1 merge per author per 60s (by timestamp in topo order)
- applyMerge handler just checks membership (consistent with other handlers)
- Trigger: opportunistic when tipHashes.size > 64
```

### Block Fetch Authorization

```
1. Decode CBOR request
2. Verify signature against senderPublicKey over CBOR signing payload
3. Reject if sentAt > now + 5 minutes (clock skew tolerance)
4. Derive group state, check senderPublicKey is member
5. Only then serve requested blocks
```

## Assumptions & Open Questions

### Confirmed Assumptions
- Old v1.0 groups are abandoned or manually migrated (no auto-migration)
- Relay servers auto-subscribe to `anypost2/` topics via peer subscription behavior
- `merge` action's "must reference ≥2 current tips" is checked at replay time in processSignedAction
- `parentHashes` max-4 validated at both schema level and processing level
- `deviceDiscoveryTopic` does NOT change prefix (v1.0 and v1.1 nodes may still discover each other but cannot interact on group topics)

### Open Questions (Deferred)
- Should `hashToTopoIndex` map be built eagerly or lazily in the web app? (Implementation decision)
- Exact clock skew tolerance for block fetch `sentAt` (5 min reasonable default)
- Whether relays should also handle `/anypost/blocks/1.0.0/get` or just group members (start with members only)

## Implementation Phases

### Phase 0: Prep — Extract Sync Module
Reduce blast radius by extracting sync machinery from multi-group-chat.ts before the rewrite.
- Extract sync signing, head comparison, sync request/response creation into `sync-protocol.ts`
- Remove `getLatestKnownHash` (becomes meaningless with frontier sync)
- No behavior change — pure refactor with existing tests passing

### Phase 1: Core Schema & Data Model Changes
Update all schemas and types for v1.1. This is the foundation everything else builds on.
- `SignableAction` + `protocolVersion: 2`
- `ActionPayload` — hash references + merge variant
- Wire message schemas — protocolVersion on all group-scoped messages
- `ActionChainGroupState` — new fields (readReceipts type change, lastMergeTimestampByAuthor)
- `parentHashes.max(4)` constraint
- Router topic prefix change
- Update all existing tests

### Phase 2: DAG & State Machine Extensions
New pure functions for frontier sync, parent selection, merge handling.
- `findMissingHashes(localDag, remoteHeads)` in action-dag.ts
- `selectParentHashes(dag, lastBuiltHead, maxParents)` in action-dag.ts
- `applyMerge` handler in action-chain-state.ts
- Merge validation in processSignedAction (≥2 tips, rate limit)
- `processBulkSignedActions` batch path

### Phase 3: Block Fetch Stream Protocol
New libp2p stream protocol for direct peer-to-peer block transfer.
- `block-fetch.ts` — handler + requester using `it-length-prefixed` CBOR framing
- Signed request with membership authorization
- Response capping (256 envelopes, 1 MiB)
- Register handler on libp2p node

### Phase 4: Frontier Sync Rewrite
Replace cursor sync with head-based sync in multi-group-chat.ts.
- `heads_announce` — publish on subscription-change, handle incoming
- `sync_request` / `sync_response` with knownHeads/theirHeads
- Inline envelope threshold (MAX_INLINE_ENVELOPES=16, MAX_INLINE_BYTES=64KiB)
- Recursive parent chase algorithm using block fetch
- Smart parent selection integration (lastBuiltHead tracking)
- Merge trigger when tipHashes.size > 64

### Phase 5: Web App Integration
Update the web app for hash-based references and v1.0 data migration.
- `canonicalMessagesByHash` index
- Edit/delete/read-receipt handlers accept hash
- `readReceipts` display via hash resolution
- v1.0 localStorage data clearing on upgrade
- Info panel updates (hash hex display)

### Phase 6: Protocol Documentation & Final Validation
- Update PROTOCOL.md to reflect v1.1
- End-to-end integration tests (divergent DAGs, block fetch, merge collapse)
- Verify all three non-negotiable invariants

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Read receipt state type | `Map<authorHex, upToHashHex>` | Consistent with hash-first references; resolve via `canonicalMessagesByHash` or `hashToTopoIndex` |
| Edit/delete hash resolution | Messages carry hash from SignedAction; handlers receive hash directly | No reverse lookup needed; cleaner data flow |
| DAG diff algorithm | Optimistic + recursive parent chase | Simpler, correct for content-addressed graphs; `missing` field handles gaps |
| Sync inline threshold | Always include `theirHeads`; ≤16 envelopes AND ≤64 KiB | Hard constants, whichever limit hits first; keeps responder logic simple |
| Block fetch auth | Signed CBOR request `{ protocolVersion:2, type:"getBlocks", groupId, hashes, sentAt }` + membership check | Prevents data exfiltration; `sentAt` replay protection |
| Merge validation location | `processSignedAction` (has DAG + group state) | `applyMerge` stays consistent with other handlers (membership only) |
| Block fetch replay | `processBulkSignedActions` — append all, verify sigs, derive state once | Avoids O(n²) full replay per action during bulk import |
| Backward compatibility | None — clean break, nuke v1.0 | Confirmed by user; localStorage cleared on upgrade |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stream protocol is new libp2p pattern | M | M | Spike with `it-length-prefixed` CBOR framing; well-documented libp2p API |
| multi-group-chat.ts change surface (1300+ lines) | H | H | Phase 0 extraction reduces blast radius; incremental rewrite |
| v1.0 persistence loss on upgrade | L | L | Expected — clear with warning log; no auto-migration needed |
| Merge rate limit gameable via fake timestamps | L | L | Timestamps checked in topo order context; out-of-order timestamps already handled by existing tiebreaker |
| Block fetch recursive chase could loop | L | H | Content-addressed graph guarantees termination; add max-depth safety cap |
| Concurrent merge actions from multiple peers | M | L | Rate limit + ≥2 tips requirement; worst case is extra merges (harmless) |
| Block fetch DoS/amplification via repeated large hash lists | M | M | 256-hash cap + 1 MiB response cap + membership check + sync rate limiting constants still apply |
| Cross-version discovery confusion (deviceDiscoveryTopic unchanged) | L | L | v1.0 and v1.1 nodes discover each other but cannot interact on group topics — harmless |

## Implementation Notes

### I1. protocolVersion Breaks v1.0 Persistence
Adding `protocolVersion: 2` to `SignableActionSchema` means `verifyAndDecodeAction` rejects stored v1.0 envelopes. Web app must clear v1.0 localStorage on first load with v1.1 code.

### I2. Stream Protocol Pattern
Use `it-length-prefixed` (already a libp2p transitive dependency) for CBOR message framing over streams. Create `block-fetch.ts` with clear request/response framing, timeout, and max-size guards.

### I3. getLatestKnownHash Removal
Remove entirely in Phase 0. Replace with `getTips(dag)` where needed.

### I4. heads_announce Signing Payload
`CBOR({ type: "heads_announce", groupId, heads, sentAt })` — sign with Ed25519, include `senderPublicKey` for verification.

### I5. canonicalMessagesByHash Index
Build parallel to `canonicalMessagesById`. Each message's hash is available from its `SignedAction`. This is an additive index.

### I6. Topic Change and topicToGroupId
Update `groupTopic()` in router.ts to use `anypost2/group/` prefix. All `topicToGroupId` registrations use the new prefix. `deviceDiscoveryTopic` stays unchanged.

### I7. parentHashes Max-4 Enforcement
Enforce in two places: `.max(4)` on `parentHashes` in `SignableActionSchema` (schema-level), and explicit check in `processSignedAction` (processing-level with rejection logging).

### I8. lastBuiltHead Tracking
Add `lastBuiltHead: Uint8Array | null` per group. Update after each locally-created action. Used by `selectParentHashes` for smart tip selection.

### I9. Merge State Field
Add `lastMergeTimestampByAuthor: ReadonlyMap<string, number>` to `ActionChainGroupState`. Updated in `applyMerge`, checked in `processSignedAction` merge validation.

### I10. Block Fetch sentAt Validation
Reject block fetch requests where `sentAt > now + 5 minutes`. This provides replay protection without being overly strict about clock skew.

## Acceptance Criteria

- [ ] Two v1.1 nodes with divergent DAG branches (A→B and A→C) sync correctly via head exchange + block fetch without missing any branch
- [ ] A new peer joining a group with 1000+ actions syncs via `heads_announce` → block fetch (not pubsub blast)
- [ ] Small reconnect catch-ups (≤16 envelopes, ≤64 KiB) use fast pubsub inline path
- [ ] `maxParents` enforced: actions with >4 parents are rejected at schema and processing level
- [ ] Smart parent selection reduces frontier width: after 10 concurrent actions from different peers, `tipHashes.size ≤ maxParents` per peer's local view
- [ ] `merge` actions collapse frontier: after merge applied, `tipHashes.size` reduced by at least 1 (merge references ≥2 tips, produces 1 new tip)
- [ ] `merge` actions are rate-limited (1/min per author, must reference ≥2 tips)
- [ ] Edit/delete/read-receipt use hash references, resolve correctly in web UI
- [ ] Block fetch requires signed request with membership verification
- [ ] Block fetch rejects requests with `sentAt` too far in future
- [ ] v1.0 and v1.1 nodes do not interact (topic isolation + protocolVersion rejection)
- [ ] v1.0 localStorage data cleared on upgrade with warning log
- [ ] All three invariants hold: deterministic convergence, byte-exact signatures, single owner
- [ ] All existing tests updated to use `protocolVersion: 2` and hash references
- [ ] PROTOCOL.md updated to reflect v1.1
- [ ] `processBulkSignedActions` batch path used for block fetch (no O(n²) replay)

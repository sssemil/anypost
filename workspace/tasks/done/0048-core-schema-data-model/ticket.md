# Core Schema & Data Model Changes for Protocol v1.1

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 1 — Core Schema & Data Model

## Description

Update all Zod schemas and TypeScript types for protocol v1.1. This is the foundation that all subsequent phases build on.

### Changes in `packages/anypost-core/src/protocol/action-chain.ts`

1. **`SignableActionSchema`**: Add `protocolVersion: z.literal(2)` as required field
2. **`parentHashes`**: Add `.max(4)` constraint
3. **`ActionPayloadSchema`**: Add 14th variant `{ type: "merge" }` (no other fields)
4. **Updated variants**:
   - `message-edited`: `targetActionId: ActionIdSchema` → `targetHash: Uint8ArraySchema`
   - `message-deleted`: `targetActionId: ActionIdSchema` → `targetHash: Uint8ArraySchema`
   - `read-receipt`: `upToActionId: ActionIdSchema` → `upToHash: Uint8ArraySchema`

### Changes in `packages/anypost-core/src/shared/schemas.ts`

1. **`SyncRequestPayloadSchema`**: Remove `knownHash`, `stateVector`. Add `knownHeads: z.array(Uint8ArraySchema)`
2. **`SyncResponsePayloadSchema`**: Remove `requestKnownHash`, `headHash`, `nextCursorHash`. Add `theirHeads: z.array(Uint8ArraySchema)`. Keep `envelopes`.
3. **New `HeadsAnnouncePayloadSchema`**: `{ groupId, heads (max 64), approxDagSize?, sentAt, senderPeerId, senderPublicKey, signature }`
4. **Add `protocolVersion: z.literal(2)`** to all group-scoped wire messages: `signed_action`, `sync_request`, `sync_response`, `heads_announce`, `join_request`, `join_request_direct`
5. **Update `DirectJoinRequestPayloadSchema`** (`join_request_direct` wire variant): Add `protocolVersion: z.literal(2)` to the wire message variant, consistent with all other group-scoped messages. The inner payload schema stays the same; only the outer wire wrapper gains the version field.
6. **Add `heads_announce` variant** to `WireMessageSchema` discriminated union

### Changes in `packages/anypost-core/src/protocol/action-chain-state.ts`

1. **`ActionChainGroupState`**: `readReceipts` value type is now hash hex (was UUID). Semantically the same Map shape `ReadonlyMap<string, string>`, just the value interpretation changes.
2. **New field**: `lastMergeTimestampByAuthor: ReadonlyMap<string, number>`
3. **`applyReadReceipt`**: Read `payload.upToHash` (was `payload.upToActionId`), store `toHex(upToHash)` as value
4. **`applyMessageEdited`** / **`applyMessageDeleted`**: Read `payload.targetHash` (was `payload.targetActionId`)

### Changes in `packages/anypost-core/src/protocol/action-signing.ts`

1. **`createSignedActionEnvelope`**: Include `protocolVersion: 2` in the SignableAction before CBOR encoding
2. **`verifyAndDecodeAction`**: Will naturally reject v1.0 envelopes (missing protocolVersion field)

### Changes in `packages/anypost-core/src/protocol/router.ts`

1. **`groupTopic`**: `anypost/group/{groupId}` → `anypost2/group/{groupId}`
2. **`MessageHandler` type**: Add `onHeadsAnnounce` handler
3. **`createRouter`**: Add `heads_announce` case in switch

### Test updates

All existing tests in:
- `action-chain.test.ts`
- `action-chain-state.test.ts`
- `action-signing.test.ts`
- `router.test.ts`
- `schemas.test.ts`
- `codec.test.ts`

Must be updated to use `protocolVersion: 2`, hash references, and new schema shapes.

## Acceptance Criteria

- [x] `SignableActionSchema` requires `protocolVersion: z.literal(2)`
- [x] `parentHashes` has `.min(1).max(4)` constraint; schemas reject 0 or >4 parents
- [x] `ActionPayloadSchema` has 14 variants including `{ type: "merge" }`
- [x] `message-edited`, `message-deleted`, `read-receipt` use `targetHash`/`upToHash` (Uint8Array)
- [x] Wire message schemas updated: `sync_request` has `knownHeads` (.max(64)), `sync_response` has `theirHeads` (.max(64)), no cursor fields
- [x] `heads_announce` wire message schema exists
- [x] `protocolVersion: 2` on all group-scoped wire messages
- [x] `groupTopic` returns `anypost2/group/{groupId}`
- [x] `ActionChainGroupState` has `lastMergeTimestampByAuthor` field
- [x] All existing tests updated and passing (955 tests)
- [x] TypeScript strict mode satisfied

## Implementation Notes

- Follow TDD: write failing test for each schema change, then update schema, then verify.
- `toHex` utility already exists in `action-chain.ts` for hash-to-hex conversion.
- The `Uint8ArraySchema` already exists in schemas.ts — reuse for `targetHash`, `upToHash`, `knownHeads`, `theirHeads`.
- Remember TS 5.9 Uint8Array gotcha: wrap with `new Uint8Array(value)` where needed.
- This task changes types and schemas only. Behavioral changes (merge validation, parent selection, sync algorithm) are in subsequent phases.

## Dependencies

- Blocked by: None
- Blocks: 0049, 0050, 0051, 0052

## History

- 2026-02-26 Created from brutal-plan PLAN-0002
- 2026-02-27 00:39 Started work on this task
- 2026-02-27 00:55 Implementation complete, starting code reduction
- 2026-02-27 00:56 Code reduction complete, starting self-review
- 2026-02-27 01:00 Self-review #1: 0 CRITICAL, 2 MAJOR, 6 MINOR, 2 NIT
- 2026-02-27 01:02 Fixed 2 MAJOR findings (parentHashes .min(1), knownHeads/theirHeads .max(64))
- 2026-02-27 01:03 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

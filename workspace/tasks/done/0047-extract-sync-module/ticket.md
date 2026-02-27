# Extract Sync Module from multi-group-chat.ts

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 0 — Prep

## Description

Extract sync-related machinery from `packages/anypost-core/src/protocol/multi-group-chat.ts` (~5300 lines) into a new `sync-protocol.ts` module. This is a pure refactor with no behavior change — it reduces the blast radius for the frontier sync rewrite in Phase 4.

### What to extract

From `multi-group-chat.ts`:
- `encodeSyncRequestSigningPayload` / `encodeSyncResponseSigningPayload` (lines ~1586-1653)
- `signSyncRequest` / `signSyncResponse` and verification functions
- `getMissingEnvelopesForKnownHash` (line ~1512)
- Sync request/response publishing helpers (`publishSyncRequest`, `publishSyncResponse`)
- Sync rate limiting state and constants (`INCOMING_SYNC_REQUEST_MAX`, `OUTGOING_SYNC_REQUEST_MAX`, `FULL_SYNC_FALLBACK_COOLDOWN_MS`)

### What to remove

- `getLatestKnownHash` — becomes meaningless with frontier sync. Remove entirely; replace any callers with `getTips(dag)`.

### Pattern

Create `packages/anypost-core/src/protocol/sync-protocol.ts` following the existing pattern of pure functions with dependency injection. Export from the barrel `src/protocol/index.ts`.

## Acceptance Criteria

- [x] New `sync-protocol.ts` module exists with extracted sync functions
- [x] `getLatestKnownHash` removed from codebase
- [x] `multi-group-chat.ts` imports from `sync-protocol.ts` instead of defining inline
- [x] All existing tests pass without modification (pure refactor)
- [x] TypeScript strict mode satisfied
- [x] Barrel export updated in `src/protocol/index.ts`

## Implementation Notes

- This is a refactor-only task. No new features, no schema changes.
- The extracted functions will be heavily modified in Phase 4, but extracting first makes the diff reviewable.
- `multi-group-chat.ts` is the highest-risk file in the rewrite (1300+ lines of change surface). Decomposing it before the rewrite is essential.

## Dependencies

- Blocked by: None
- Blocks: 0051 (frontier-sync-rewrite)

## History

- 2026-02-26 Created from brutal-plan PLAN-0002
- 2026-02-26 23:17 Started work on this task
- 2026-02-26 23:26 Implementation complete (pure functions extracted, getLatestKnownHash removed)
- 2026-02-26 23:35 Self-review #1: 1 CRITICAL, 3 MAJOR, 2 MINOR, 3 NIT
- 2026-02-26 23:36 Fixed: dagHeadHash determinism, verify try/catch, spread pattern, missing tests
- 2026-02-26 23:40 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-26 23:41 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

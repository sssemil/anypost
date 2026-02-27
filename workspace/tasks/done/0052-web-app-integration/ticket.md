# Web App Integration for Protocol v1.1

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 5 — Web App Integration

## Description

Update the web app (`apps/anypost-web/`) for hash-based references and v1.0 data migration.

### Hash indexes in `App.tsx`

1. **`canonicalMessagesByHash: Map<string, CanonicalMessage>`**: Build alongside existing `canonicalMessagesById`. Key is `toHex(action.hash)`. Each message's hash is available from its `SignedAction`.

2. **`hashToTopoIndex: Map<string, number>`** (REQUIRED): For "read up to position" resolution. Maps hash hex → index in topologically ordered message list. This replaces the current `messageIndexById` used at `App.tsx:4581` for read receipt position resolution. Without this, read receipts cannot resolve display position.

3. **`latestEditByTargetHash` / `latestDeleteByTargetHash`**: Re-key existing `latestEditByTargetId` / `latestDeleteByTargetId` maps from UUID to hash hex.

### Edit/delete/read-receipt API changes

- `editMessage(groupId, targetHash, newText)` — receives `Uint8Array` hash (not UUID)
- `deleteMessage(groupId, targetHash)` — receives `Uint8Array` hash
- `sendReadReceipt(groupId, upToHash)` — receives `Uint8Array` hash
- UI components pass the hash from the message data they already hold (each rendered message carries its hash from the SignedAction)
- `readReceiptLastSentByGroup` tracking changes from UUID to hash hex

### v1.0 localStorage migration

On first load with v1.1 code:
1. Detect presence of v1.0 persisted data (look for existing localStorage keys)
2. Clear all v1.0 action chain data (envelopes, group state)
3. Log a warning: `"Cleared v1.0 action chain data — protocol upgraded to v1.1"`
4. v1.0 groups will appear empty (user must rejoin with v1.1 peers)

### Info panel updates

- `DirectMessageInfoPanel.tsx` / `GroupInfoPanel.tsx`: Display `toHex(hash).slice(0, 8)` instead of `targetActionId.slice(0, 8)` in debug views
- Add `merge` action display case (if merge actions appear in action lists)

## Acceptance Criteria

- [x] `canonicalMessagesByHash` index built and used for edit/delete resolution
- [x] `editMessage`, `deleteMessage`, `sendReadReceipt` accept hash parameter
- [x] UI components pass message hash to edit/delete handlers
- [x] Read receipts stored and resolved by hash hex
- [x] v1.0 localStorage data cleared on upgrade with warning log
- [x] Info panels display hash hex instead of UUID
- [x] Merge actions handled gracefully in UI (displayed or filtered as appropriate)
- [x] All TypeScript strict mode satisfied (SolidJS components)

## Implementation Notes

- The web app uses SolidJS (not React). Use SolidJS reactive primitives (`createSignal`, `createMemo`, `createEffect`).
- Build `canonicalMessagesByHash` as a `createMemo` derived from the same data source as `canonicalMessagesById`.
- For the localStorage migration: check for a `protocolVersion` key in localStorage. If absent or `< 2`, clear and set to `2`.
- Remember: `pnpm build` in core before new barrel exports resolve at runtime in the web app.
- The `toHex` utility is already exported from `anypost-core`.

## Dependencies

- Blocked by: 0048 (schemas must be updated for hash references), 0051 (core API signatures for editMessage/deleteMessage/sendReadReceipt change in the sync rewrite — web app integration testing requires the new signatures)
- Blocks: 0053 (final validation needs working web app)

## History

- 2026-02-26 Created from brutal-plan PLAN-0002
- 2026-02-27 01:56 Started work on this task
- 2026-02-27 02:15 Core API changes: fromHex utility, hash-based editMessage/deleteMessage/sendReadReceipt signatures
- 2026-02-27 02:30 Web app changes: hash-based maps, message dispatch, read receipt logic, info panels, localStorage migration
- 2026-02-27 03:15 Code reduction complete
- 2026-02-27 03:18 Self-review #1: 2 CRITICAL, 1 MAJOR, 2 MINOR
- 2026-02-27 03:22 Fixes applied: hashHex guards, complete migration, fromHex hardening, reconciliation propagation
- 2026-02-27 03:25 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

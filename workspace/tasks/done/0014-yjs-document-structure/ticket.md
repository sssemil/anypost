# Yjs Document Structure

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Implement the Yjs document structure for groups in `anypost-core/src/data/documents/group.ts`. Each group has a Y.Doc containing metadata (Y.Map), channels (Y.Array), and members (Y.Map). Message ordering metadata is also stored in the CRDT. TDD required.

## Acceptance Criteria

- [x] `createGroupDocument` returns a Y.Doc with correct guid
- [x] `appendMessage` adds message to channel's Y.Array
- [x] `appendMessage` creates channel array if it doesn't exist
- [x] `getChannelMessages` returns all messages for a channel
- [x] `getChannelMessages` returns empty array for unknown channel
- [x] `setGroupMetadata` stores metadata in Y.Map
- [x] `getGroupMetadata` parses metadata via GroupMetadataSchema
- [x] `addMember` / `removeMember` / `getMembers` work correctly
- [x] `addChannel` appends to channels Y.Array
- [x] Two Y.Docs merge correctly via Yjs sync protocol
- [x] Concurrent appends to same channel merge deterministically
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly with all tests listed above
- Group Y.Doc structure:
  - `metadata` (Y.Map): group name, description, created timestamp, steward peer ID
  - `channels` (Y.Array): list of channel objects (id, name, type: text/voice, sort order)
  - `members` (Y.Map): keyed by account public key, value is member info (role, joined timestamp, device certificates)
- Messages stored as metadata references in CRDT; actual plaintext content in IndexedDB directly
- Use Zod schemas from `anypost-core/src/shared/` for validation
- Factory functions for test data

## Dependencies

- Blocked by: 0008
- Blocks: 0015, 0016, 0017

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 09:27 Started work on this task
- 2026-02-22 09:27 Implementation complete (RED-GREEN-REFACTOR), starting code reduction
- 2026-02-22 09:28 Code reduction complete, starting self-review
- 2026-02-22 09:30 Self-review #1: 0 CRITICAL, 4 MAJOR, 2 MINOR, 1 NIT
- 2026-02-22 09:33 Fixed all MAJOR findings: schema validation at CRDT boundaries, transact, barrel exports, shared factories
- 2026-02-22 09:34 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

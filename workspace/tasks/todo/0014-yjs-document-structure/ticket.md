# Yjs Document Structure

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Implement the Yjs document structure for groups in `anypost-core/src/data/documents/group.ts`. Each group has a Y.Doc containing metadata (Y.Map), channels (Y.Array), and members (Y.Map). Message ordering metadata is also stored in the CRDT. TDD required.

## Acceptance Criteria

- [ ] `createGroupDocument` returns a Y.Doc with correct guid
- [ ] `appendMessage` adds message to channel's Y.Array
- [ ] `appendMessage` creates channel array if it doesn't exist
- [ ] `getChannelMessages` returns all messages for a channel
- [ ] `getChannelMessages` returns empty array for unknown channel
- [ ] `setGroupMetadata` stores metadata in Y.Map
- [ ] `getGroupMetadata` parses metadata via GroupMetadataSchema
- [ ] `addMember` / `removeMember` / `getMembers` work correctly
- [ ] `addChannel` appends to channels Y.Array
- [ ] Two Y.Docs merge correctly via Yjs sync protocol
- [ ] Concurrent appends to same channel merge deterministically
- [ ] All tests pass via TDD

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

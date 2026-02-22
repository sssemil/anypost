# Channels (Text and Voice Types)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement channel management within groups. Channels are stored in the group's Yjs document. Types: text (for messages) and voice (for voice/video calls). TDD required.

## Acceptance Criteria

- [x] `createChannel` adds channel to group Yjs doc
- [x] `createChannel` assigns incrementing sort order
- [x] `deleteChannel` removes channel and its messages
- [x] Channel types: 'text' or 'voice'
- [x] Default "general" text channel created with new groups
- [ ] Channel list UI renders channels for active group (deferred — UI in web app, not core)
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Channel schema: `{ id: ChannelId, name: string, type: 'text' | 'voice', sortOrder: number }`
- Stored in group Y.Doc's `channels` Y.Array
- Sort order: auto-incrementing integer, allows reordering later
- Delete channel: remove from Y.Array + clean up associated message data
- Voice channels don't store messages — they're entry points for voice/video calls (Phase 5)

## Dependencies

- Blocked by: 0028
- Blocks: 0036

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 13:43 Started work on this task
- 2026-02-22 14:47 Implementation complete
- 2026-02-22 14:55 Self-review #1: 0 CRITICAL, 1 MAJOR (sortOrder collision), 2 MINOR
- 2026-02-22 14:58 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 14:59 Task completed

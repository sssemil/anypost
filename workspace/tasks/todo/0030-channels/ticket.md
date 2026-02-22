# Channels (Text and Voice Types)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement channel management within groups. Channels are stored in the group's Yjs document. Types: text (for messages) and voice (for voice/video calls). TDD required.

## Acceptance Criteria

- [ ] `createChannel` adds channel to group Yjs doc
- [ ] `createChannel` assigns incrementing sort order
- [ ] `deleteChannel` removes channel and its messages
- [ ] Channel types: 'text' or 'voice'
- [ ] Default "general" text channel created with new groups
- [ ] Channel list UI renders channels for active group
- [ ] All tests pass via TDD

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

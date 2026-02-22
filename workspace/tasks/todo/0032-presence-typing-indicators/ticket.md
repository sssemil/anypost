# Presence and Typing Indicators

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement presence (online/offline) and typing indicators. Presence uses periodic heartbeats over GossipSub. Typing indicators are ephemeral messages that don't persist. TDD required.

## Acceptance Criteria

- [ ] `setPresence` broadcasts online status to group peers
- [ ] `setTyping` broadcasts typing indicator to channel peers
- [ ] Presence times out after 30 seconds without heartbeat
- [ ] Member list shows online/offline status
- [ ] Typing indicator shown below message input
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Presence heartbeat: send every 15 seconds, timeout after 30 seconds
- Presence messages: ephemeral (not stored in CRDT or IndexedDB)
- Typing indicator: sent when user starts typing, auto-expires after 5 seconds
- Both use GossipSub but with a dedicated "ephemeral" message type
- Don't encrypt presence/typing with MLS — these are low-value metadata
  (Reconsider if privacy is paramount — but it adds latency to ephemeral signals)

## Dependencies

- Blocked by: 0012, 0028
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

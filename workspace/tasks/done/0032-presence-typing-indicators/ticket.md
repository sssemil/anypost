# Presence and Typing Indicators

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement presence (online/offline) and typing indicators. Presence uses periodic heartbeats over GossipSub. Typing indicators are ephemeral messages that don't persist. TDD required.

## Acceptance Criteria

- [x] `setPresence` broadcasts online status to group peers
- [x] `setTyping` broadcasts typing indicator to channel peers
- [x] Presence times out after 30 seconds without heartbeat
- [ ] Member list shows online/offline status (UI — deferred to web app task)
- [ ] Typing indicator shown below message input (UI — deferred to web app task)
- [x] All tests pass via TDD

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
- 2026-02-22 15:04 Started work on this task
- 2026-02-22 15:05 Implementation complete (RED→GREEN for 11 tests)
- 2026-02-22 15:06 Code reduction complete, starting self-review
- 2026-02-22 15:07 Self-review #1: 0 CRITICAL, 1 MAJOR (unbounded memory growth), 2 MINOR, 2 NIT
- 2026-02-22 15:09 Fixed MAJOR: added pruneExpired function with 3 tests
- 2026-02-22 15:10 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 15:10 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

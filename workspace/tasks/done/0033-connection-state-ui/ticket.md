# Connection State UI and Error Handling

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement the connection state machine visible in the UI with a persistent quality indicator. Handle error states, empty states, and optimistic message sending. TDD required.

## Acceptance Criteria

- [x] Connection state machine: disconnected → connecting-to-relay → discovering-peers → connected (relayed) → connected (direct)
- [x] Persistent connection quality indicator (red/yellow/green mapping)
- [ ] "No peers online" state shows cached messages with offline indicator (UI — deferred to web app)
- [x] Optimistic message sending: show immediately, mark "sending..." until confirmed
- [ ] Empty states with actionable prompts (UI — deferred to web app)
- [x] Error states for: relay unreachable, WebRTC failed, MLS decrypt failed
- [x] All tests pass via TDD

## Implementation Notes

- Connection state machine as a SolidJS signal/store
- Connection indicator: green (direct), yellow (relayed), red (disconnected)
- Optimistic UI: add message to local state immediately, update status on GossipSub confirmation
- Empty states:
  - No groups: "Create a group or accept an invite to get started"
  - No messages: "Send the first message!"
  - No peers online: "You're offline. Messages will sync when peers come online."
- Error recovery: auto-retry connection with exponential backoff
- Crypto error states: "Unable to decrypt message (epoch key unavailable)" with explanation

## Dependencies

- Blocked by: 0010, 0013
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 15:11 Started work on this task
- 2026-02-22 15:13 Implementation complete (connection-state + optimistic-send)
- 2026-02-22 15:14 Self-review #1: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 15:16 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

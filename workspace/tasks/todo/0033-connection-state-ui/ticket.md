# Connection State UI and Error Handling

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement the connection state machine visible in the UI with a persistent quality indicator. Handle error states, empty states, and optimistic message sending. TDD required.

## Acceptance Criteria

- [ ] Connection state machine: disconnected → connecting-to-relay → discovering-peers → connected (relayed) → connected (direct)
- [ ] Persistent connection quality indicator in UI
- [ ] "No peers online" state shows cached messages with offline indicator
- [ ] Optimistic message sending: show immediately, mark "sending..." until confirmed
- [ ] Empty states with actionable prompts (no groups, no messages, no members online)
- [ ] Error states for: relay unreachable, WebRTC failed, MLS decrypt failed
- [ ] All tests pass via TDD

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

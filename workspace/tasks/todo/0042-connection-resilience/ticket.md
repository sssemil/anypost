# Connection Resilience (Auto-Reconnect, Relay Fallback)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement connection resilience: auto-reconnect to relay after disconnect, fall back to relay when WebRTC direct connection fails, re-establish GossipSub subscriptions after reconnect. TDD required.

## Acceptance Criteria

- [ ] Node auto-reconnects to relay after disconnect
- [ ] Node falls back to relay when WebRTC fails
- [ ] Node re-establishes GossipSub subscriptions after reconnect
- [ ] Exponential backoff for reconnection attempts
- [ ] Connection state UI updates during reconnection
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Auto-reconnect: detect relay disconnect → exponential backoff retry → reconnect
- WebRTC fallback: if direct connection fails → fall back to circuit relay for data
- GossipSub re-subscribe: after reconnect, re-subscribe to all group topics + account device topic
- Backoff: start at 1s, double each attempt, max 30s, with jitter
- Consider: multiple relay nodes for redundancy (try next relay if primary fails)
- Integrate with connection state UI from task 0033

## Dependencies

- Blocked by: 0010, 0033
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

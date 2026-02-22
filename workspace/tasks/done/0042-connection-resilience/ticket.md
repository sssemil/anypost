# Connection Resilience (Auto-Reconnect, Relay Fallback)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement connection resilience: auto-reconnect to relay after disconnect, fall back to relay when WebRTC direct connection fails, re-establish GossipSub subscriptions after reconnect. TDD required.

## Acceptance Criteria

- [x] Node auto-reconnects to relay after disconnect
- [x] Node falls back to relay when WebRTC fails
- [x] Node re-establishes GossipSub subscriptions after reconnect
- [x] Exponential backoff for reconnection attempts
- [x] Connection state UI updates during reconnection
- [x] All tests pass via TDD

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
- 2026-02-22 15:16 Started work on this task
- 2026-02-22 15:18 Implementation complete
- 2026-02-22 15:19 Self-review #1: 0 CRITICAL, 2 MAJOR — weak cap test, no input validation
- 2026-02-22 15:21 Fixed: validation, jitter, cap test
- 2026-02-22 15:22 Self-review #2: 0 CRITICAL, 1 MAJOR — missing cross-field validation
- 2026-02-22 15:22 Fixed: maxDelayMs >= baseDelayMs guard
- 2026-02-22 15:24 Self-review #3: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 15:24 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

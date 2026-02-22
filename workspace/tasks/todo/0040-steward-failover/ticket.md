# Steward Failover and Election

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement steward failover when the current steward goes offline. Remaining members detect steward absence and deterministically elect a new steward who resumes commit processing. Only needed if using steward model (not DMLS). TDD required.

## Acceptance Criteria

- [ ] Group detects steward offline after configurable timeout
- [ ] Remaining members elect new steward deterministically (e.g., lowest PeerId)
- [ ] New steward resumes commit processing
- [ ] Pending proposals from offline period are processed
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Steward heartbeat: broadcast every 15 seconds on group topic
- Detection: if no heartbeat for 60 seconds, steward considered offline
- Election: deterministic algorithm — all members independently compute same result
  - Option: lowest account public key among online members
  - All members must agree — use GossipSub consensus round
- New steward: claim steward role, process queued proposals, resume normal operation
- Edge case: split-brain (two members think they're steward) — handled by MLS epoch conflict detection

## Dependencies

- Blocked by: 0023, 0028
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

# Commit Ordering (DMLS or Steward Model)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Implement MLS commit ordering in `anypost-core/src/crypto/steward.ts`. MLS requires linear commit ordering — in P2P there's no central server. If DMLS proved feasible in the spike, implement DAG-based concurrent commits. Otherwise, implement the steward model where a designated peer serializes commits. TDD required.

## Acceptance Criteria

- [x] Steward applies commits in received order
- [x] Steward rejects commits from non-members
- [x] Concurrent add-member requests are serialized by steward
- [x] Steward broadcasts commit to all group members
- [x] Steward sends welcome only to the new member
- [x] Non-steward peer queues commits for steward
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Steward model:
  - Group creator is initial steward
  - Steward serializes MLS proposals (Add, Remove, Update) into commits
  - Other peers send proposals to steward via direct libp2p stream
  - Steward applies proposals, creates commit, broadcasts to group
  - Welcome message sent directly to new member
- Steward has no extra privileges — same encryption keys as everyone else
- If steward offline: existing members can still chat (current epoch keys), but can't modify membership
- Steward election/failover is deferred to Phase 6 (task 0040)
- If DMLS: replace steward with per-member Send Groups + DAG epochs

## Dependencies

- Blocked by: 0022
- Blocks: 0024

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 11:15 Started work on this task
- 2026-02-22 12:25 Implementation complete, starting code reduction
- 2026-02-22 12:26 Code reduction complete (no reductions needed), starting self-review
- 2026-02-22 12:30 Self-review #1: 1 CRITICAL, 3 MAJOR, 2 MINOR, 0 NIT
- 2026-02-22 11:41 Fixed all 6 findings (1 CRITICAL, 3 MAJOR, 2 MINOR)
- 2026-02-22 11:41 Self-review #2: 0 CRITICAL, 0 MAJOR, 0 MINOR, 0 NIT — APPROVED
- 2026-02-22 11:41 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

# Commit Ordering (DMLS or Steward Model)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Implement MLS commit ordering in `anypost-core/src/crypto/steward.ts`. MLS requires linear commit ordering — in P2P there's no central server. If DMLS proved feasible in the spike, implement DAG-based concurrent commits. Otherwise, implement the steward model where a designated peer serializes commits. TDD required.

## Acceptance Criteria

- [ ] Steward applies commits in received order
- [ ] Steward rejects commits from non-members
- [ ] Concurrent add-member requests are serialized by steward
- [ ] Steward broadcasts commit to all group members
- [ ] Steward sends welcome only to the new member
- [ ] Non-steward peer queues commits for steward
- [ ] All tests pass via TDD

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

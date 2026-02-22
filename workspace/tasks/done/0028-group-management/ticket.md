# Group Management (Create, Invite, Join, Leave)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement group management operations that coordinate MLS groups with Yjs documents. Creating a group creates both an MLS group and a Yjs doc. Inviting/joining uses MLS Add via steward + Yjs sync. Leaving uses MLS Remove. TDD required.

## Acceptance Criteria

- [x] `createGroup` creates MLS group and Yjs doc
- [x] `inviteMember` generates invite with key package request
- [x] `acceptInvite` joins MLS group and syncs Yjs doc
- [x] `leaveGroup` removes self from MLS group
- [x] Group creator is owner role
- [x] Owner is initial steward
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Group creation flow: create MLS group → create Yjs doc → set metadata → add creator as owner/steward
- Invite flow: generate invite link → invitee opens link → KeyPackage exchange → steward commits Add → Welcome message → invitee joins
- Leave flow: self-remove from MLS group → update Yjs doc → unsubscribe from GossipSub topic
- Roles: owner (creator), member (invited). Admin role deferred (out of scope for v1)

## Dependencies

- Blocked by: 0018, 0022, 0023, 0024
- Blocks: 0029, 0030, 0031

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 12:57 Started work on this task
- 2026-02-22 14:04 Implementation complete, starting code reduction
- 2026-02-22 14:05 Code reduction complete, starting self-review
- 2026-02-22 14:10 Self-review #1: 0 CRITICAL, 2 MAJOR, 1 MINOR
- 2026-02-22 14:11 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 14:12 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

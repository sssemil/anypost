# Group Management (Create, Invite, Join, Leave)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement group management operations that coordinate MLS groups with Yjs documents. Creating a group creates both an MLS group and a Yjs doc. Inviting/joining uses MLS Add via steward + Yjs sync. Leaving uses MLS Remove. TDD required.

## Acceptance Criteria

- [ ] `createGroup` creates MLS group and Yjs doc
- [ ] `inviteMember` generates invite with key package request
- [ ] `acceptInvite` joins MLS group and syncs Yjs doc
- [ ] `leaveGroup` removes self from MLS group
- [ ] Group creator is owner role
- [ ] Owner is initial steward
- [ ] All tests pass via TDD

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

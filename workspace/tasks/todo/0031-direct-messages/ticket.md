# Direct Messages (2-Member MLS Groups)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement direct messages as 2-member MLS groups. DMs appear in a separate DM list in the UI, not in the group list. TDD required.

## Acceptance Criteria

- [ ] `startDM` creates a 2-member MLS group
- [ ] DM messages encrypted for exactly 2 members
- [ ] DM appears in DM list, not group list
- [ ] DM has a single implicit text channel (no channel management)
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- DMs are MLS groups with exactly 2 members
- DM Yjs doc is simpler: no channels array, just a single message stream
- DM metadata: the other person's display name + public key
- Flag in group metadata to distinguish DMs from groups: `{ isDM: true }`
- Starting a DM: create 2-member MLS group → exchange KeyPackages → steward commits

## Dependencies

- Blocked by: 0028
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

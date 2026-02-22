# Multi-Device: Multiple MLS Leaf Nodes Per Account

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3c — Multi-Device

## Description

Implement multi-device support at the MLS layer. Each device of the same account has its own MLS leaf node in every group. When a new device is added to an account, MLS Add proposals are created across all groups the account belongs to. TDD required.

## Acceptance Criteria

- [x] Each device has its own MLS leaf node per group
- [x] New device added to account triggers MLS Add proposals for all groups
- [x] Both devices can encrypt and decrypt group messages
- [x] Removing a device triggers MLS Remove proposals
- [x] All tests pass via TDD

## Implementation Notes

- Each device generates its own KeyPackage (signed by device key, linked to account via certificate)
- When adding a new device: iterate all groups → create MLS Add proposal for new device's KeyPackage → steward commits
- Both devices independently encrypt/decrypt — no key sharing between devices
- Device removal: MLS Remove proposal to revoke the device's leaf node
- Depends on device discovery (task 0027) — new devices must be discovered before they can be added to groups
- When adding a new device: iterate all groups → create MLS Add proposal for new device's KeyPackage → steward commits

## Dependencies

- Blocked by: 0019, 0022, 0027
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 12:41 Started work on this task
- 2026-02-22 13:49 Implementation complete, starting code reduction
- 2026-02-22 13:50 Code reduction complete, starting self-review
- 2026-02-22 13:52 Self-review #1: 0 CRITICAL, 1 MAJOR, 2 MINOR, 0 NIT
- 2026-02-22 13:55 Fixed MAJOR: added 3 edge-case tests (empty groups, duplicate add)
- 2026-02-22 13:56 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 13:57 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

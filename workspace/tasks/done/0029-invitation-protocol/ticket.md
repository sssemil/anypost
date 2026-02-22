# Group Invitation Protocol and UX

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement the group invitation protocol including invite link generation, KeyPackage exchange, and the invitation UX flow. Invite links encode group ID + inviter multiaddress + optional pre-shared secret. TDD required.

## Acceptance Criteria

- [x] Invite link generated with group ID + inviter multiaddress
- [x] Invite link optionally includes pre-shared secret
- [x] KeyPackage exchange via `/anypost/key-package/1.0.0` libp2p protocol
- [x] Offline invitations: Welcome messages stored in group CRDT, encrypted to invitee's public key
- [ ] "Invite" button generates shareable link/QR (deferred to web app tasks)
- [ ] Recipient opens link in browser → auto-joins group (deferred to web app tasks)
- [x] All tests pass via TDD

## Implementation Notes

- Invite link format: URL with group ID, inviter's multiaddress, optional PSK encoded in fragment
- KeyPackage exchange protocol:
  1. Invitee connects to inviter (or any online group member)
  2. Invitee sends KeyPackage via `/anypost/key-package/1.0.0` stream
  3. Member forwards KeyPackage to steward
  4. Steward creates MLS Add commit + Welcome message
  5. Welcome sent to invitee, commit broadcast to group
- Offline invitation: if invitee is offline, Welcome message stored in group CRDT
- QR code generation for mobile-friendly sharing
- URL should be a deep link that opens the web app directly

## Dependencies

- Blocked by: 0028
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 13:12 Started work on this task
- 2026-02-22 14:00 Implementation complete, starting code reduction
- 2026-02-22 14:10 Code reduction complete, starting self-review
- 2026-02-22 14:30 Self-review #1: 1 CRITICAL, 3 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 14:35 Fixed all CRITICAL/MAJOR findings
- 2026-02-22 15:45 Self-review #2: 0 CRITICAL, 0 MAJOR, 5 MINOR, 4 NIT — APPROVED
- 2026-02-22 15:46 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

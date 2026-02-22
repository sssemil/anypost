# Group Invitation Protocol and UX

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Implement the group invitation protocol including invite link generation, KeyPackage exchange, and the invitation UX flow. Invite links encode group ID + inviter multiaddress + optional pre-shared secret. TDD required.

## Acceptance Criteria

- [ ] Invite link generated with group ID + inviter multiaddress
- [ ] Invite link optionally includes pre-shared secret
- [ ] KeyPackage exchange via `/anypost/key-package/1.0.0` libp2p protocol
- [ ] Offline invitations: Welcome messages stored in group CRDT, encrypted to invitee's public key
- [ ] "Invite" button generates shareable link/QR
- [ ] Recipient opens link in browser → auto-joins group
- [ ] All tests pass via TDD

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

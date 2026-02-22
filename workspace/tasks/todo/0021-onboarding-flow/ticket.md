# Onboarding Flow

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement the first-time user onboarding flow in the SolidJS web app. On first launch: auto-generate account key, prompt for display name immediately, defer seed phrase backup with persistent banner until backed up. TDD required.

## Acceptance Criteria

- [ ] First-time users get an auto-generated account key
- [ ] Display name prompt appears immediately after key generation
- [ ] Seed phrase backup is deferred but a persistent banner reminds the user
- [ ] Banner disappears after user confirms seed phrase backup
- [ ] Returning users skip onboarding (key exists in IndexedDB)
- [ ] Import flow: seed phrase / key file / QR code scan to restore existing account
- [ ] All tests pass via TDD

## Implementation Notes

- Onboarding state machine: no-account → generating → display-name-prompt → ready (with backup-pending)
- Store account key encrypted in IndexedDB (consider: encrypt under device-local key or raw?)
- Backup banner: non-dismissible until user completes backup flow
- Backup flow: show seed phrase → confirm user wrote it down (re-enter words or checkbox)
- Import flow: text input for seed phrase, file picker for key file, QR code scanner (camera-based)
- UX should be simple — minimize friction for first-time users

## Dependencies

- Blocked by: 0018, 0019, 0020
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

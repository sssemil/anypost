# Onboarding Flow

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement the first-time user onboarding flow in the SolidJS web app. On first launch: auto-generate account key, prompt for display name immediately, defer seed phrase backup with persistent banner until backed up. TDD required.

## Acceptance Criteria

- [x] First-time users get an auto-generated account key
- [x] Display name prompt appears immediately after key generation
- [x] Seed phrase backup is deferred but a persistent banner reminds the user
- [x] Banner disappears after user confirms seed phrase backup
- [x] Returning users skip onboarding (key exists in IndexedDB)
- [x] Import flow: seed phrase / key file / QR code scan to restore existing account
- [x] All tests pass via TDD

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
- 2026-02-22 10:04 Started work on this task
- 2026-02-22 11:36 Task completed. Final review #4 passed with 0 CRITICAL, 0 MAJOR findings.

# User Profile with Display Name

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement the per-account settings Yjs document in `anypost-core/src/data/documents/settings.ts`. This document stores user profile information (display name, etc.) and syncs between the user's devices. Users are shown as "DisplayName (..xxxx)" with key suffix for disambiguation. TDD required.

## Acceptance Criteria

- [x] Per-account settings Y.Doc created with account-derived guid
- [x] Display name stored and retrieved from settings doc
- [x] Settings doc syncs between devices via Yjs
- [x] User display format: "DisplayName (..xxxxxxxx)" with last 8 hex chars of public key
- [x] Settings persist in IndexedDB
- [x] All tests pass via TDD

## Implementation Notes

- Per-account settings Y.Doc contains:
  - Display name (Y.Map entry)
  - Notification preferences (Y.Map)
  - Group membership list (Y.Array)
  - Device registry (Y.Map — keyed by device PeerId)
- Display name disambiguation: append last 4 hex chars of account public key
- No uniqueness enforcement on display names
- This doc syncs via the per-account GossipSub topic and Yjs sync provider

## Dependencies

- Blocked by: 0014, 0018
- Blocks: 0021, 0034

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 09:49 Started work on this task
- 2026-02-22 10:58 Self-review #1: 1 CRITICAL, 1 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 11:05 Fixed: test description mismatch, added write-side validation + max(100)
- 2026-02-22 11:15 Self-review #2: 0 CRITICAL, 0 MAJOR, 3 MINOR, 5 NIT — APPROVED
- 2026-02-22 11:16 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

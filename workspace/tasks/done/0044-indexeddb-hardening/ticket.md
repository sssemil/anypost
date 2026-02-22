# IndexedDB Hardening (Persist API, MLS State Backup)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Harden IndexedDB persistence: ensure `navigator.storage.persist()` is called, implement MLS state backup encrypted under account key and synced in per-account Yjs doc, add "state lost" detection on startup with automatic rejoin workflow. TDD required.

## Acceptance Criteria

- [x] `navigator.storage.persist()` called and result handled
- [x] MLS state backup encrypted under account key
- [x] MLS state backup synced in per-account Yjs doc
- [x] "State lost" detection on startup triggers rejoin workflow
- [x] User warned that clearing browser data destroys message decryption capability
- [x] All tests pass via TDD

## Implementation Notes

- `navigator.storage.persist()` may be denied by browser — handle gracefully, warn user
- MLS state backup: serialize MLS group states → encrypt with account key → store in per-account Yjs doc
- State backup frequency: after every epoch change (commit/welcome processing)
- State lost detection: on startup, check if MLS state exists in IndexedDB for all known groups
  - If missing: attempt restore from per-account Yjs backup
  - If backup also missing: trigger rejoin workflow (request Welcome from group members)
- Warning: show one-time notice about browser data = message history

## Dependencies

- Blocked by: 0015, 0022
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 15:34 Started work on this task
- 2026-02-22 15:36 Implementation complete, starting self-review
- 2026-02-22 15:38 Self-review #1: 0 CRITICAL, 0 MAJOR, 1 MINOR (fixed) — APPROVED
- 2026-02-22 15:39 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

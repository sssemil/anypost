# IndexedDB Hardening (Persist API, MLS State Backup)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Harden IndexedDB persistence: ensure `navigator.storage.persist()` is called, implement MLS state backup encrypted under account key and synced in per-account Yjs doc, add "state lost" detection on startup with automatic rejoin workflow. TDD required.

## Acceptance Criteria

- [ ] `navigator.storage.persist()` called and result handled
- [ ] MLS state backup encrypted under account key
- [ ] MLS state backup synced in per-account Yjs doc
- [ ] "State lost" detection on startup triggers rejoin workflow
- [ ] User warned that clearing browser data destroys message decryption capability
- [ ] All tests pass via TDD

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

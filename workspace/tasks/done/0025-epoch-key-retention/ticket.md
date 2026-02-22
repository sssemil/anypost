# Epoch Key Retention with Bounded Window

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Implement bounded epoch key retention for MLS. Keys are retained for a configurable window (default: 30 days or N epochs) to allow offline peers to decrypt missed messages. Keys beyond the window are deleted to preserve forward secrecy. TDD required.

## Acceptance Criteria

- [x] Epoch keys retained within configured window
- [x] Keys beyond retention window deleted automatically
- [x] Messages from retained epochs still decryptable
- [x] Messages from deleted epochs cannot be decrypted (forward secrecy)
- [x] Retention window configurable (time-based and epoch-count-based)
- [x] Message buffer for out-of-order epoch key arrival (done in 0024)
- [x] All tests pass via TDD

## Implementation Notes

- Retention window: configurable, default 30 days or N epochs (whichever is smaller)
- Explicit trade-off: offline >30 days = can't decrypt missed messages
- Key storage: IndexedDB, keyed by group ID + epoch number
- Cleanup: periodic sweep to delete expired keys
- Message buffer: when a message arrives for an epoch whose key hasn't arrived yet, buffer it until the key arrives or timeout
- This is critical for forward secrecy — old keys MUST be deleted

## Dependencies

- Blocked by: 0024
- Blocks: 0041

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 11:57 Started work on this task
- 2026-02-22 12:30 Implementation complete, started code reduction
- 2026-02-22 12:35 Code reduction complete, started self-review
- 2026-02-22 13:10 Self-review #1: 1 CRITICAL, 2 MAJOR, 1 MINOR — NEEDS_FIXES
- 2026-02-22 13:20 Fixed all findings: key zeroing, bigint sort, config validation, outer spread
- 2026-02-22 13:25 Self-review #2: 0 CRITICAL, 1 MAJOR (SecretTree zeroing — fixed) — APPROVED
- 2026-02-22 13:30 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

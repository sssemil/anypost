# MLS/DMLS Group Lifecycle

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Implement the MLS group lifecycle manager in `anypost-core/src/crypto/mls-manager.ts`. This wraps ts-mls to provide: group creation, member add/remove, encrypt/decrypt, KeyPackage management, and Welcome message handling. Uses DMLS extensions if spike proved feasible, otherwise steward model. TDD required.

## Acceptance Criteria

- [x] `createMlsGroup` returns group state with epoch 0
- [x] `generateKeyPackage` produces a valid key package
- [x] `addMember` produces welcome message for new member
- [x] `addMember` produces commit message for existing members
- [x] `addMember` increments epoch
- [x] `joinFromWelcome` creates group state matching the group
- [x] `encryptMessage` produces ciphertext different from plaintext
- [x] Group member decrypts message encrypted by another member
- [x] Non-member fails to decrypt group message
- [x] `removeMember` produces commit revoking access
- [x] Removed member fails to decrypt messages after removal
- [x] Message encrypted before removal still decryptable by removed member
- [x] Key update advances epoch
- [x] Messages from old epoch still decrypt with retained keys
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — all 14 tests listed above, written before implementation
- This is a wrapper around ts-mls — abstract away the library's API
- Version of ts-mls determined by spike task 0001
- If DMLS feasible (spike task 0004): implement per-member Send Groups
- If DMLS infeasible: implement with steward model (task 0023 handles commit ordering)
- KeyPackage lifecycle: generate, distribute, consume, refresh
- Abstraction layer should allow swapping MLS implementation if needed
- All MLS state must be serializable for IndexedDB backup

## Dependencies

- Blocked by: 0008
- Blocks: 0023, 0024, 0025

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 10:50 Started work on this task
- 2026-02-22 12:00 Implementation complete (14 tests, all passing), starting code reduction
- 2026-02-22 12:05 Code reduction complete, starting self-review
- 2026-02-22 12:06 Self-review #1: 1 CRITICAL, 1 MAJOR, 5 MINOR, 0 NIT
- 2026-02-22 12:10 Fixed: AuthenticationService injectable, result types exported
- 2026-02-22 12:11 Self-review #2: 0 CRITICAL, 1 MAJOR (AuthenticationService re-export), 0 MINOR
- 2026-02-22 12:12 Fixed: AuthenticationService type re-exported from barrel
- 2026-02-22 12:14 Self-review #3: APPROVED. 0 CRITICAL, 0 MAJOR
- 2026-02-22 12:15 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

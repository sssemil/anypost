# MLS/DMLS Group Lifecycle

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Implement the MLS group lifecycle manager in `anypost-core/src/crypto/mls-manager.ts`. This wraps ts-mls to provide: group creation, member add/remove, encrypt/decrypt, KeyPackage management, and Welcome message handling. Uses DMLS extensions if spike proved feasible, otherwise steward model. TDD required.

## Acceptance Criteria

- [ ] `createMlsGroup` returns group state with epoch 0
- [ ] `generateKeyPackage` produces a valid key package
- [ ] `addMember` produces welcome message for new member
- [ ] `addMember` produces commit message for existing members
- [ ] `addMember` increments epoch
- [ ] `joinFromWelcome` creates group state matching the group
- [ ] `encryptMessage` produces ciphertext different from plaintext
- [ ] Group member decrypts message encrypted by another member
- [ ] Non-member fails to decrypt group message
- [ ] `removeMember` produces commit revoking access
- [ ] Removed member fails to decrypt messages after removal
- [ ] Message encrypted before removal still decryptable by removed member
- [ ] Key update advances epoch
- [ ] Messages from old epoch still decrypt with retained keys
- [ ] All tests pass via TDD

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

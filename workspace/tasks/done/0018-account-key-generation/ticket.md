# Account Key Generation (Seed Phrase -> ed25519)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement account key generation in `anypost-core/src/crypto/identity.ts`. Account identity is an ed25519 keypair, derivable from a seed phrase (BIP39-style) or generated randomly. Includes key export/import functionality. TDD required.

## Acceptance Criteria

- [x] `generateAccountKey` produces an ed25519 keypair
- [x] `accountKeyFromSeed` is deterministic (same seed = same key)
- [x] `accountKeyFromSeed` produces different keys for different seeds
- [x] `exportAccountKey` produces importable format (seed phrase or raw key)
- [x] `importAccountKey` reconstructs the same keypair
- [x] `seedPhraseToKey` round-trip preserves identity
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first:
  - "generateAccountKey should produce an ed25519 keypair"
  - "accountKeyFromSeed should be deterministic (same seed = same key)"
  - "accountKeyFromSeed should produce different keys for different seeds"
  - "exportAccountKey should produce importable format"
  - "importAccountKey should reconstruct the same keypair"
  - "seedPhraseToKey round-trip should preserve identity"
- Use `@noble/ed25519` — already a libp2p dependency, avoids dual crypto libraries
- Seed phrase: consider BIP39 word list for human-readable backup
- Key derivation from seed: use HKDF or similar KDF to derive ed25519 seed from mnemonic
- Export formats: seed phrase (primary), raw key bytes (secondary)
- No `any` types — proper typed key representations

## Dependencies

- Blocked by: 0007
- Blocks: 0019, 0020, 0021

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 09:15 Started work on this task
- 2026-02-22 09:45 Implementation complete, starting code reduction
- 2026-02-22 09:50 Code reduction complete, starting self-review
- 2026-02-22 10:00 Self-review #1: 0 CRITICAL, 2 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 10:26 Fixed both MAJOR findings (sign/verify test + accountKeyFromSeed validation)
- 2026-02-22 10:27 Self-review #2: 0 CRITICAL, 0 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 10:28 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

# Account Key Generation (Seed Phrase -> ed25519)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement account key generation in `anypost-core/src/crypto/identity.ts`. Account identity is an ed25519 keypair, derivable from a seed phrase (BIP39-style) or generated randomly. Includes key export/import functionality. TDD required.

## Acceptance Criteria

- [ ] `generateAccountKey` produces an ed25519 keypair
- [ ] `accountKeyFromSeed` is deterministic (same seed = same key)
- [ ] `accountKeyFromSeed` produces different keys for different seeds
- [ ] `exportAccountKey` produces importable format (seed phrase or raw key)
- [ ] `importAccountKey` reconstructs the same keypair
- [ ] `seedPhraseToKey` round-trip preserves identity
- [ ] All tests pass via TDD

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

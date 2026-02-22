# Device Key Generation and Device Certificates

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3a — Identity

## Description

Implement device key generation and device certificates in `anypost-core/src/crypto/identity.ts`. Each device generates its own keypair (used as libp2p PeerId). A device certificate links the device to the account by signing `{ devicePeerId, accountPublicKey, timestamp }` with the account key. TDD required.

## Acceptance Criteria

- [x] `generateDeviceKey` produces a unique keypair each call
- [x] `createDeviceCertificate` signs with account key
- [x] `createDeviceCertificate` includes device PeerId and account public key
- [x] `verifyDeviceCertificate` accepts valid certificate
- [x] `verifyDeviceCertificate` rejects certificate signed by wrong key
- [x] `verifyDeviceCertificate` rejects expired certificate
- [x] `verifyDeviceCertificate` rejects tampered certificate
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Device certificate structure: `{ devicePeerId, accountPublicKey, timestamp, signature }`
- Signature covers: `devicePeerId + accountPublicKey + timestamp` (CBOR-encoded for deterministic serialization)
- Certificate expiry: configurable TTL (e.g., 1 year default)
- Use `@noble/ed25519` for signing/verification
- Device key is separate from account key — device key becomes the libp2p PeerId
- Zod schema for DeviceCertificate at trust boundary

## Dependencies

- Blocked by: 0018
- Blocks: 0021, 0026, 0027

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 09:31 Started work on this task
- 2026-02-22 10:40 Self-review #1: 1 CRITICAL, 1 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 10:44 Fixed: future timestamp guard + malformed data try/catch
- 2026-02-22 10:50 Self-review #2: 0 CRITICAL, 0 MAJOR, 1 MINOR, 0 NIT — APPROVED
- 2026-02-22 10:51 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

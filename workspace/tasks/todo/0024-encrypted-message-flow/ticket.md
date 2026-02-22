# Encrypted Message Flow Integration

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3b — E2E Encryption

## Description

Wire the MLS encryption into the message flow: encrypt before sending, decrypt on receive, store plaintext locally. This is the integration of MLS (task 0022) with the CRDT/GossipSub message pipeline (Phase 1-2). TDD required.

## Acceptance Criteria

- [ ] Message is MLS-encrypted before CRDT insertion
- [ ] Receiving peer MLS-decrypts after CRDT sync
- [ ] Non-member peer subscribed to GossipSub cannot decrypt
- [ ] Messages buffered when epoch key hasn't arrived yet, decrypted when key becomes available
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — integration tests first:
  - "message should be MLS-encrypted before CRDT insertion"
  - "receiving peer should MLS-decrypt after CRDT sync"
  - "non-member peer subscribed to GossipSub should not decrypt"
  - "buffered message should decrypt when epoch key arrives"
- Multi-device decryption ("two devices of same account both receive and decrypt") is covered by task 0026
- Decrypt-on-receive architecture:
  1. Sender encrypts plaintext with MLS epoch key
  2. Encrypted payload published via GossipSub
  3. Message metadata (sender, timestamp, channel, message ID) stored in CRDT
  4. Receiver gets encrypted payload via GossipSub
  5. Receiver decrypts immediately using current epoch key
  6. Plaintext stored in IndexedDB (keyed by message ID)
- Encrypted payloads also stored for offline peers who need to catch up
- Message buffer needed for out-of-order epoch key arrival

## Dependencies

- Blocked by: 0022, 0023
- Blocks: 0025

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

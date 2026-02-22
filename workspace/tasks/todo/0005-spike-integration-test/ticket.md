# Spike E: Integration — Encrypted Message via GossipSub in Yjs Doc

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 0 — Technical Spike

## Description

Combine the findings from Spikes A-C into an integration test: send an MLS-encrypted message between two browser peers via GossipSub, with the message metadata stored in a Yjs CRDT document.

Throwaway code — no TDD requirement for spikes.

This validates the core message flow that the entire application depends on:
1. Peer A encrypts a message using MLS
2. Peer A publishes encrypted payload via GossipSub
3. Peer A stores message metadata in Yjs doc
4. Peer B receives via GossipSub + Yjs sync
5. Peer B decrypts using MLS epoch key
6. Peer B sees plaintext message

## Acceptance Criteria

- [ ] Two browser peers form an MLS group
- [ ] Peer A encrypts and sends a message
- [ ] Peer B receives and decrypts the message
- [ ] Message metadata syncs via Yjs CRDT
- [ ] Encrypted payload delivered via GossipSub
- [ ] End-to-end latency measured and documented
- [ ] Integration approach validated for production architecture

## Implementation Notes

- Depends on successful completion of Spikes A (ts-mls), B (libp2p WebRTC), and C (Yjs sync)
- Use the decrypt-on-receive architecture: decrypt immediately, store plaintext in IndexedDB
- CRDT stores message metadata (sender, timestamp, channel, message ID)
- GossipSub delivers the encrypted payload
- This spike validates the core data flow that Phase 3b will implement properly

## Dependencies

- Blocked by: 0001, 0002, 0003
- Blocks: 0006

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

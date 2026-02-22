# GossipSub Security Hardening

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Harden GossipSub configuration: peer scoring, opaque topic names to prevent enumeration, message validation, and FloodSub fallback for small networks. TDD required.

## Acceptance Criteria

- [ ] GossipSub peer scoring configured to penalize misbehaving peers
- [ ] Topic names use opaque hashes (not readable group IDs)
- [ ] Message validation rejects malformed or oversized messages
- [ ] FloodSub fallback for networks below GossipSub mesh threshold
- [ ] All tests pass via TDD

## Implementation Notes

- Opaque topic names: `SHA256(group_id + salt)` instead of `anypost.group.<group_id>`
- Peer scoring: penalize peers that send invalid messages, flood, or don't forward
- Message validation: check CBOR structure, message size limits, sender verification
- FloodSub fallback: if fewer than 6 peers in mesh, use FloodSub (more reliable for tiny networks)
- GossipSub configuration: D=6, Dlo=4, Dhi=12, Dlazy=6 (defaults, tune based on testing)
- Message size limit: 64KB for text messages (prevent abuse)

## Dependencies

- Blocked by: 0012
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

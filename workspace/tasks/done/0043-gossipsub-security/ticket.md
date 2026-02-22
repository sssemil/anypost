# GossipSub Security Hardening

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Harden GossipSub configuration: peer scoring, opaque topic names to prevent enumeration, message validation, and FloodSub fallback for small networks. TDD required.

## Acceptance Criteria

- [x] GossipSub peer scoring configured to penalize misbehaving peers
- [x] Topic names use opaque hashes (not readable group IDs)
- [x] Message validation rejects malformed or oversized messages
- [x] FloodSub fallback for networks below GossipSub mesh threshold
- [x] All tests pass via TDD

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
- 2026-02-22 15:27 Started work on this task
- 2026-02-22 15:30 Implementation complete, starting code reduction
- 2026-02-22 15:31 Code reduction complete, starting self-review
- 2026-02-22 15:32 Self-review #1: 0 CRITICAL, 2 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 15:33 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 15:34 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

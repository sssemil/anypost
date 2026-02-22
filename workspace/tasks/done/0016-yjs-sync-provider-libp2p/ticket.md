# Custom Yjs Sync Provider Over libp2p

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Implement a custom Yjs sync provider that operates over libp2p in `anypost-core/src/data/sync/provider.ts`. Uses GossipSub for real-time update broadcasting and direct libp2p streams for state vector sync (catch-up). This is custom code — the existing y-libp2p library is abandoned. TDD required.

This is one of the highest-effort tasks (~2-3 weeks) and carries significant risk.

## Acceptance Criteria

- [x] Sync provider sends state vector on new peer connection
- [x] Sync provider applies received updates to local doc
- [x] Sync provider sends missing updates when peer requests sync
- [x] Offline peer catches up on all missed messages after reconnect
- [x] Concurrent updates from multiple peers handled correctly
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first:
  - "sync provider should send state vector on new peer connection"
  - "sync provider should apply received updates to local doc"
  - "sync provider should send missing updates when peer requests sync"
  - "offline peer should catch up on all missed messages after reconnect"
  - "sync should handle concurrent updates from multiple peers"
- Two sync channels:
  1. **GossipSub**: broadcast Yjs updates in real-time (fire-and-forget)
  2. **Direct streams** (`/anypost/yjs-sync/1.0.0`): state vector exchange for catch-up
- Yjs sync protocol: Step 1 (exchange state vectors) → Step 2 (send missing updates)
- Encode Yjs updates as raw bytes in messages
- Must handle: peer join, peer leave, network partition, reconnection
- Spike findings from task 0003 should inform the implementation approach
- Consider backpressure for large catch-up syncs

## Dependencies

- Blocked by: 0010, 0014
- Blocks: 0017

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 08:47 Started work on this task
- 2026-02-22 09:55 Implementation complete, starting code reduction
- 2026-02-22 09:56 Code reduction complete, starting self-review
- 2026-02-22 10:00 Self-review #1: 2 CRITICAL, 3 MAJOR, 3 MINOR, 1 NIT
- 2026-02-22 10:02 Fixed all CRITICAL/MAJOR findings (bidirectional sync, protocol collision, stream bounds, type guards, error handling)
- 2026-02-22 10:03 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

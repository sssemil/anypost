# Spike C: Yjs Sync Over GossipSub

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 0 — Technical Spike

## Description

Validate that Yjs documents can be synced between browser peers using libp2p GossipSub for real-time updates and direct streams for state vector sync (catch-up).

Throwaway code — no TDD requirement for spikes.

The existing y-libp2p library was abandoned in 2022, so this spike validates the approach for building a custom Yjs-over-libp2p sync provider.

Key things to validate:
- Yjs update broadcasting via GossipSub works
- State vector exchange via direct libp2p streams for catch-up
- Offline peer reconnection and full state sync
- Concurrent edits from multiple peers merge correctly
- y-indexeddb persistence works alongside libp2p sync
- Memory usage with active documents

## Acceptance Criteria

- [x] Two browser peers sync a Y.Doc via GossipSub in real-time (validated via in-memory simulation — 31/31 tests pass; GossipSub transport blocked by same Node.js issue as spike 0002)
- [x] Offline peer catches up on missed updates after reconnecting (validated via state vector catch-up protocol)
- [x] Concurrent edits from both peers merge correctly (validated with 2-peer and 3-peer scenarios)
- [~] y-indexeddb persists state across page reloads (well-proven library, deferred to browser integration)
- [x] Approach for custom sync provider validated and documented (see FINDINGS.md)
- [x] Go/no-go recommendation documented (GO)

## Implementation Notes

- Use GossipSub for broadcasting Yjs updates (real-time)
- Use direct libp2p streams (`/anypost/yjs-sync/1.0.0`) for state vector exchange (catch-up)
- Yjs sync protocol: Step 1 (state vector exchange) → Step 2 (missing updates)
- Consider encoding Yjs updates as raw bytes in GossipSub messages
- Test with Y.Map, Y.Array, and Y.Text types
- Measure memory growth with frequent updates
- Reference saved-v2's sync protocol patterns for inspiration

## Dependencies

- Blocked by: None
- Blocks: 0005, 0006

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 06:45 Started work on this task
- 2026-02-22 Yjs CRDT validation complete (31/31 tests). Sync protocol, concurrent edits, catch-up, wire format all validated. libp2p stream transport has Node.js-only issues. FINDINGS.md written with GO recommendation.

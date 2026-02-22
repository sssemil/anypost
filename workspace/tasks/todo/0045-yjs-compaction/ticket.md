# Yjs Document Compaction for Long-Lived Groups

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement Yjs document compaction to manage memory and storage growth in long-lived groups. Old message metadata can be archived/compacted to keep the active document small. TDD required.

## Acceptance Criteria

- [ ] Document compaction reduces Yjs doc size for groups with many messages
- [ ] Compaction preserves recent messages and all metadata
- [ ] Archived messages still accessible from IndexedDB (not from CRDT)
- [ ] Compaction threshold configurable (e.g., >10000 messages)
- [ ] All tests pass via TDD

## Implementation Notes

- Yjs documents grow with every operation (tombstones, metadata)
- Compaction strategy: periodically snapshot the Y.Doc and create a fresh doc from the snapshot
- Message windowing: only keep last N message metadata entries in CRDT, archive older ones
- Archived message content already in IndexedDB — just need to maintain an index
- Consider: compaction trigger (message count, doc size, time interval)
- Compaction must be coordinated across peers to avoid sync conflicts

## Dependencies

- Blocked by: 0014, 0016
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

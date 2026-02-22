# Yjs Document Compaction for Long-Lived Groups

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement Yjs document compaction to manage memory and storage growth in long-lived groups. Old message metadata can be archived/compacted to keep the active document small. TDD required.

## Acceptance Criteria

- [x] Document compaction reduces Yjs doc size for groups with many messages
- [x] Compaction preserves recent messages and all metadata
- [x] Archived messages still accessible from IndexedDB (not from CRDT)
- [x] Compaction threshold configurable (e.g., >10000 messages)
- [x] All tests pass via TDD

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
- 2026-02-22 16:40 Started work on this task
- 2026-02-22 16:45 Implementation complete, starting code reduction
- 2026-02-22 16:45 Code reduction complete, starting self-review
- 2026-02-22 16:47 Self-review #1: 0 CRITICAL, 3 MAJOR, 0 MINOR, 0 NIT — fixed integer validation, negative guard, strengthened tests
- 2026-02-22 16:49 Self-review #2: 0 CRITICAL, 1 MAJOR, 2 MINOR, 0 NIT — fixed no-op compaction (retainedMessageCount == messageThreshold)
- 2026-02-22 16:50 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

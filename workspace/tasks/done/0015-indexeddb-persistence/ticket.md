# IndexedDB Persistence

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Implement IndexedDB persistence for Yjs documents and message content in `anypost-core/src/data/`. Uses y-indexeddb for Yjs doc persistence and direct idb access for plaintext message content storage. TDD required (Vitest browser mode).

## Acceptance Criteria

- [x] Persisted Y.Doc survives page reload simulation
- [x] Persisted doc restores all messages from IndexedDB
- [x] Persisted doc restores group metadata
- [x] Plaintext message content stored/retrieved via IndexedDB
- [x] `navigator.storage.persist()` called on first launch
- [x] All tests pass via TDD (fake-indexeddb polyfill)

## Implementation Notes

- Follow TDD strictly — tests need Vitest browser mode:
  - "persisted doc should survive page reload simulation"
  - "persisted doc should restore all messages from IndexedDB"
  - "persisted doc should restore group metadata"
- Use `y-indexeddb` for Yjs document persistence
- Use `idb` library for direct IndexedDB access (plaintext message content)
- Decrypt-on-receive architecture: MLS-encrypted messages are decrypted immediately, plaintext stored in IndexedDB keyed by message ID
- Call `navigator.storage.persist()` on first launch to request persistent storage
- Consider a "state lost" detection mechanism on startup

## Dependencies

- Blocked by: 0014
- Blocks: 0017

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 08:34 Started work on this task
- 2026-02-22 08:39 Implementation complete (8 tests passing)
- 2026-02-22 08:40 Code reduction complete
- 2026-02-22 08:42 Self-review #1: 1 CRITICAL, 4 MAJOR, 2 MINOR, 0 NIT
- 2026-02-22 08:45 All CRITICAL/MAJOR findings fixed (11 tests passing)
- 2026-02-22 08:46 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

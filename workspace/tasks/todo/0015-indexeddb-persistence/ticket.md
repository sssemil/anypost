# IndexedDB Persistence

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Implement IndexedDB persistence for Yjs documents and message content in `anypost-core/src/data/`. Uses y-indexeddb for Yjs doc persistence and direct idb access for plaintext message content storage. TDD required (Vitest browser mode).

## Acceptance Criteria

- [ ] Persisted Y.Doc survives page reload simulation
- [ ] Persisted doc restores all messages from IndexedDB
- [ ] Persisted doc restores group metadata
- [ ] Plaintext message content stored/retrieved via IndexedDB
- [ ] `navigator.storage.persist()` called on first launch
- [ ] All tests pass via TDD (browser mode)

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

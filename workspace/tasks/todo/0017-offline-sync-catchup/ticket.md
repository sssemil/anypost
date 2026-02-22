# Offline Sync and Catch-Up Integration

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Wire the Yjs sync provider and IndexedDB persistence into the web app. Achieve the Phase 2 milestone: messages persist across reloads, and offline peers catch up on missed messages when they reconnect. TDD required.

## Acceptance Criteria

- [ ] Messages persist after page reload (integration test)
- [ ] Offline peer sees missed messages after reconnecting (integration test)
- [ ] Yjs sync + IndexedDB persistence work together without conflicts
- [ ] No data loss during normal usage patterns (send, reload, reconnect)
- [ ] All tests pass via TDD

## Implementation Notes

- Integration tests:
  - "messages should persist after page reload"
  - "offline peer should see missed messages after reconnecting"
- This task wires together: Yjs documents (0014) + IndexedDB persistence (0015) + Yjs sync provider (0016) + SolidJS app (0013)
- Test scenarios should simulate: send message → reload → verify message present
- Test scenarios should simulate: peer A sends while peer B is offline → peer B reconnects → verify catch-up
- May need Playwright for realistic multi-browser integration testing

## Dependencies

- Blocked by: 0015, 0016
- Blocks: 0022 (Phase 3 builds on this)

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

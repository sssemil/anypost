# Offline Sync and Catch-Up Integration

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 2 — Persistence & CRDT

## Description

Wire the Yjs sync provider and IndexedDB persistence into the web app. Achieve the Phase 2 milestone: messages persist across reloads, and offline peers catch up on missed messages when they reconnect. TDD required.

## Acceptance Criteria

- [x] Messages persist after page reload (integration test)
- [x] Offline peer sees missed messages after reconnecting (integration test)
- [x] Yjs sync + IndexedDB persistence work together without conflicts
- [x] No data loss during normal usage patterns (send, reload, reconnect)
- [x] All tests pass via TDD

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
- 2026-02-22 09:06 Started work on this task
- 2026-02-22 09:10 Implementation complete — 3 integration tests passing (97 total)
- 2026-02-22 09:12 Code reduction complete, starting self-review
- 2026-02-22 09:15 Self-review #1: 1 CRITICAL, 2 MAJOR, 2 MINOR, 0 NIT
- 2026-02-22 09:18 Fixed all CRITICAL/MAJOR: unique message IDs, resource cleanup, naming
- 2026-02-22 09:20 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

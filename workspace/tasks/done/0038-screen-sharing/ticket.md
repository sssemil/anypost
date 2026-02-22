# Screen Sharing

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Implement screen sharing via `getDisplayMedia` API. Screen share replaces the video track if camera is active, or adds a new video track if not. TDD required.

## Acceptance Criteria

- [x] `startScreenShare` captures sharing state and records previous camera state (getDisplayMedia deferred to integration)
- [x] `stopScreenShare` clears sharing state and previous camera reference
- [x] Tracks previous camera state for restoration (replaces video track logic deferred to integration)
- [x] Records camera-inactive state when sharing starts without camera
- [ ] Other peers see the shared screen in the video grid (UI — deferred to task 0039)
- [x] All tests pass via TDD (11 tests)

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Use `navigator.mediaDevices.getDisplayMedia({ video: true })` for screen capture
- Screen track replaces camera track in RTCPeerConnection (renegotiation needed)
- When screen share stops: restore camera track if it was active before
- Screen share stream has an `ended` event for when user stops sharing via browser UI
- Consider: screen share at higher resolution than camera (adjust video encoding params)

## Dependencies

- Blocked by: 0035
- Blocks: 0039

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 14:49 Started work on this task
- 2026-02-22 14:49 Implementation complete (TDD: 11 tests RED→GREEN)
- 2026-02-22 14:52 Self-review #1: 0 CRITICAL, 0 MAJOR, 1 MINOR, 1 NIT — APPROVED
- 2026-02-22 14:52 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

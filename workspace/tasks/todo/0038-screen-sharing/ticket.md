# Screen Sharing

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Implement screen sharing via `getDisplayMedia` API. Screen share replaces the video track if camera is active, or adds a new video track if not. TDD required.

## Acceptance Criteria

- [ ] `startScreenShare` uses getDisplayMedia to capture screen
- [ ] `stopScreenShare` removes screen track
- [ ] Screen share replaces video track if camera is active
- [ ] Screen share adds as new track if camera is not active
- [ ] Other peers see the shared screen in the video grid
- [ ] All tests pass via TDD

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

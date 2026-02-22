# Video Calls (Full Mesh, Up to 4 Peers)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Implement video call functionality extending the voice call system. Video calls use full mesh topology limited to 4 peers (bandwidth constraint: 8 peers = ~17.5 Mbps upload, unrealistic for residential). TDD required.

## Acceptance Criteria

- [ ] `startVideoCall` adds local video track
- [ ] `toggleCamera` adds/removes video track
- [ ] Video grid renders remote video streams
- [ ] Full mesh works with up to 4 peers (video)
- [ ] Video can be toggled on/off during a voice call
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Video builds on voice call infrastructure — same RTCPeerConnection, add video track
- 4-peer limit for video: 4 peers = 6 connections * ~1.5 Mbps = ~9 Mbps upload (reasonable)
- Use `getUserMedia({ video: true, audio: true })` for video calls
- Camera toggle: add/remove video track from existing peer connections
- Video grid layout: 1 peer = full screen, 2 = side by side, 3-4 = 2x2 grid

## Dependencies

- Blocked by: 0035, 0036
- Blocks: 0039

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

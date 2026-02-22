# Voice Channels (Full Mesh, Up to 8 Peers)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Implement voice channel functionality in `anypost-core/src/media/voice-call.ts`. Voice calls use native WebRTC `RTCPeerConnection` in a full mesh topology. Audio-only supports up to 8 peers. TDD required.

## Acceptance Criteria

- [ ] `startVoiceCall` creates RTCPeerConnection
- [ ] `startVoiceCall` adds local audio track
- [ ] `joinVoiceChannel` establishes connections to all channel peers
- [ ] `leaveVoiceChannel` closes all peer connections
- [ ] `mute` disables local audio track
- [ ] `unmute` re-enables local audio track
- [ ] Full mesh works with up to 8 peers (audio-only)
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Full mesh: each peer connects to every other peer (n*(n-1)/2 connections)
- 8 peers audio-only = 28 connections, manageable bandwidth
- Use `getUserMedia({ audio: true })` to get local audio
- DTLS-SRTP provides transport-level encryption for media
- Voice channels defined in group Yjs doc (type: 'voice' from task 0030)
- Joining a voice channel: discover current participants → establish connections → add audio tracks

## Dependencies

- Blocked by: 0030, 0035
- Blocks: 0039

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

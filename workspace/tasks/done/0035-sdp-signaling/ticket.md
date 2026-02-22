# SDP Signaling Over libp2p Streams

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Implement WebRTC SDP/ICE signaling over libp2p streams in `anypost-core/src/media/signaling.ts`. This establishes the signaling channel for native WebRTC media connections (voice/video/screenshare). Uses the `/anypost/media-signal/1.0.0` libp2p protocol. TDD required.

## Acceptance Criteria

- [x] `createOffer` produces valid SDP offer signal message
- [x] `createAnswer` produces valid SDP answer signal message
- [x] Signal messages route through libp2p media-signal protocol
- [x] ICE candidates trickle through signal stream
- [x] Hangup signal terminates the call
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Signaling protocol: `/anypost/media-signal/1.0.0` — direct libp2p stream between peers
- Signal message types: offer, answer, ice-candidate, hangup
- Use CBOR encoding for signal messages (consistent with rest of protocol)
- This is signaling only — actual media uses native `RTCPeerConnection` (not libp2p data channels)
- Trickle ICE: send ICE candidates as they're discovered, don't wait for all

## Dependencies

- Blocked by: 0010, 0012
- Blocks: 0036, 0037, 0038

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 14:29 Started work on this task
- 2026-02-22 14:35 Implementation complete: SignalMessageSchema, encode/decode, protocol constant
- 2026-02-22 15:40 Self-review #1: 0 CRITICAL, 3 MAJOR (nullable ICE fields, factory validation, size limits)
- 2026-02-22 15:42 All fixes applied. ICE fields nullable per WebRTC spec, max length constraints added
- 2026-02-22 15:42 Self-review #2: APPROVED (0 CRITICAL, 0 MAJOR)
- 2026-02-22 15:42 Task completed. 18 tests, 52 lines production code.

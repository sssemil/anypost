# Voice/Video UI (Controls, Grid, Speaking Indicators)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Build the SolidJS UI components for voice/video calls: call controls bar, video grid, speaking indicators, and voice channel participant list. TDD required.

## Acceptance Criteria

- [ ] VoiceChannel component shows join/leave button
- [ ] VoiceChannel component shows speaking indicators (audio level visualization)
- [ ] VideoGrid renders remote video streams in responsive layout
- [ ] CallControls shows mute/camera/screen share/hangup buttons
- [ ] Speaking detection via audio level analysis
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above, using Vitest browser mode)
- Speaking indicators: analyze audio levels via `AudioContext.createAnalyser()` — highlight border when speaking
- Video grid layout: responsive based on participant count (1=full, 2=split, 3-4=grid)
- Call controls: mute toggle, camera toggle, screen share toggle, hangup button
- Voice channel sidebar: show list of participants with speaking/muted state
- Consider: picture-in-picture mode for video calls while browsing channels

## Dependencies

- Blocked by: 0036, 0037, 0038
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

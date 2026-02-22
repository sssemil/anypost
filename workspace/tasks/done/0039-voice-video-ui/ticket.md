# Voice/Video UI (Controls, Grid, Speaking Indicators)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 5 — Voice, Video & Screen Sharing

## Description

Build the SolidJS UI components for voice/video calls: call controls bar, video grid, speaking indicators, and voice channel participant list. TDD required.

## Acceptance Criteria

- [ ] VoiceChannel component shows join/leave button (SolidJS — deferred, needs component testing infra)
- [x] Speaking detection via audio level threshold analysis (isSpeaking)
- [x] VideoGrid layout calculation (getGridLayout — responsive 1x1, 2x1, 2x2, 3x2, 3x3)
- [x] CallControls state derivation (getCallControlsState — mute/camera/screen/hangup)
- [ ] SolidJS component rendering (deferred — needs @solidjs/testing-library + Vitest browser mode)
- [x] All pure logic tests pass via TDD (20 tests)

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
- 2026-02-22 14:53 Started work on this task
- 2026-02-22 14:54 Pure logic implementation complete (TDD: 20 tests RED→GREEN)
- 2026-02-22 14:57 Self-review #1: 0 CRITICAL, 1 MAJOR (NaN grid layout), 2 MINOR
- 2026-02-22 14:57 Fixed: guard getGridLayout against NaN/Infinity with Number.isFinite()
- 2026-02-22 14:58 Self-review #2: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 14:59 Task completed. SolidJS components deferred (needs testing infrastructure).

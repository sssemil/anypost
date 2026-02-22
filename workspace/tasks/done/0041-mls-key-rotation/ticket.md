# MLS Key Rotation for Forward Secrecy

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement periodic MLS key rotation to maintain forward secrecy. Key updates advance the epoch, and old epoch keys are retained within the configured window then deleted. TDD required.

## Acceptance Criteria

- [x] Key rotation triggers after configurable interval (time or message count)
- [x] Key rotation advances epoch
- [x] Old epoch keys retained for configured window (default 30 days)
- [x] Keys beyond retention window deleted
- [x] Key rotation is transparent to users (no disruption)
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (all listed above)
- Rotation trigger: configurable — e.g., every 24 hours or every 1000 messages, whichever comes first
- Rotation is an MLS Update proposal → steward commits → new epoch
- Builds on epoch key retention from task 0025
- Rotation should be coordinated: only steward triggers rotation to avoid conflicts
- Consider: rotation during active typing — buffer messages during epoch transition

## Dependencies

- Blocked by: 0025
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 15:10 Started work on this task
- 2026-02-22 15:12 Implementation complete, starting self-review
- 2026-02-22 15:13 Self-review #1: 0 CRITICAL, 1 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 15:14 Fixed: strengthened custom config test to verify values applied
- 2026-02-22 15:15 Self-review #2: 0 CRITICAL, 0 MAJOR, 0 MINOR, 0 NIT — APPROVED
- 2026-02-22 15:16 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

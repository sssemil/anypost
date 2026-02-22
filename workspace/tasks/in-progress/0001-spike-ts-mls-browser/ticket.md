# Spike A: ts-mls in Browser

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 0 — Technical Spike

## Description

Validate that ts-mls works in a browser environment. Test both v1.6.1 (stable) and v2.0.0-rc.8 (upcoming) to determine which version to use for production.

Throwaway code — no TDD requirement for spikes.

Key things to validate:
- ts-mls can run in browser (no Node.js-only dependencies)
- MLS group creation, member add/remove work
- Encrypt/decrypt round-trip succeeds
- KeyPackage generation and Welcome message handling work
- Performance is acceptable for real-time chat (encrypt/decrypt latency)
- Web Crypto API integration (or polyfill needs)
- Bundle size impact

## Acceptance Criteria

- [x] ts-mls v1.6.1 tested in browser — document what works and what doesn't
- [x] ts-mls v2.0.0-rc.8 tested in browser — document what works and what doesn't
- [x] MLS group lifecycle (create, add member, encrypt, decrypt, remove member) demonstrated
- [x] Go/no-go recommendation with version choice and rationale documented
- [x] Any browser-specific workarounds or polyfills identified

## Implementation Notes

- ts-mls is a pure TypeScript implementation of RFC 9420
- v2.0.0-rc.8 has API changes from v1.6.1 — document migration path if choosing v2
- Test with at least 3 members in a group to validate multi-party scenarios
- Measure encrypt/decrypt latency — should be <10ms for text messages
- Check if ts-mls uses Web Crypto API natively or needs a crypto backend

## Dependencies

- Blocked by: None
- Blocks: 0005, 0006

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 06:02 Started work on this task
- 2026-02-22 06:30 Both versions tested. v1.6.1 has state serialization bug. v2.0.0-rc.8 recommended.
- 2026-02-22 06:35 Task completed. GO with v2.0.0-rc.8. See spikes/0001-ts-mls-browser/FINDINGS.md

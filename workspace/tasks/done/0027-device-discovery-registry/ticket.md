# Device Discovery and Registry Sync

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 3c — Multi-Device

## Description

Implement device discovery via account-derived GossipSub topics and device registry sync via per-account Yjs document. When a new device comes online, it publishes its device certificate on the account topic. Other devices discover it and sync the device registry. TDD required.

## Acceptance Criteria

- [x] Device publishes certificate on `anypost.account.<pubkey-hash>.devices` GossipSub topic
- [x] Other devices for same account discover new device via topic subscription
- [x] Device registry synced via per-account Yjs doc
- [x] New device discovery triggers downstream MLS Add flow (handled by task 0026)
- [x] All tests pass via TDD

## Implementation Notes

- Identity bootstrap flow:
  1. Device generates PeerId and device certificate (signed by account key)
  2. Device subscribes to `anypost.account.<pubkey-hash>.devices`
  3. Device publishes its certificate on the topic
  4. Other same-account devices receive certificate, verify signature
  5. Verified devices added to device registry in per-account Yjs doc
  6. Once connected, devices sync full registry via Yjs
- Device registry in per-account Y.Doc: keyed by device PeerId, value includes certificate, last-seen timestamp, device name
- Consider: what happens if two devices come online simultaneously?
- Consider: what happens if a device certificate is revoked?

## Dependencies

- Blocked by: 0019, 0020
- Blocks: 0026, 0034

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 12:23 Started work on this task
- 2026-02-22 12:34 Implementation complete, starting code reduction
- 2026-02-22 12:34 Code reduction complete, starting self-review
- 2026-02-22 12:34 Self-review #1: 1 CRITICAL, 2 MAJOR, 2 MINOR, 1 NIT
- 2026-02-22 12:37 Self-review #2: 0 CRITICAL, 2 MAJOR, 0 MINOR, 0 NIT
- 2026-02-22 12:42 Self-review #3: 0 CRITICAL, 0 MAJOR — APPROVED
- 2026-02-22 12:42 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

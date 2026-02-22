# Settings Sync Across Devices

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 4 — Full Chat UI

## Description

Wire the per-account settings Yjs doc (from task 0020) into the full application. Settings changes on one device sync to all other devices for the same account. TDD required.

## Acceptance Criteria

- [ ] Display name change syncs to other devices
- [ ] Notification preference change syncs
- [ ] Settings sync uses per-account Yjs doc
- [ ] Settings persist in IndexedDB
- [ ] Settings UI in the web app
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first:
  - "display name change should sync to other devices"
  - "notification preference change should sync"
  - "settings sync should use per-account Yjs doc"
  - "settings should persist in IndexedDB"
- Settings synced via dedicated per-account GossipSub topic
- Uses same Yjs sync provider as group documents
- Settings UI: display name editor, notification toggles, device list, seed phrase backup status
- Consider: conflict resolution for concurrent settings changes (Yjs handles this via CRDT)

## Dependencies

- Blocked by: 0020, 0027
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

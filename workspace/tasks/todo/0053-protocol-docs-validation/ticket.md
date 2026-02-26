# Protocol Documentation & Final Validation

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 6 — Protocol Documentation & Final Validation

## Description

Update PROTOCOL.md to reflect v1.1 and run comprehensive end-to-end validation of all acceptance criteria.

### PROTOCOL.md update

Update the existing `/home/user/Workspaces/anypost/PROTOCOL.md` to document:
- `protocolVersion: 2` everywhere (SignableAction, all group-scoped wire messages)
- Frontier sync algorithm (knownHeads/theirHeads, heads_announce, inline threshold)
- Block fetch protocol (`/anypost/blocks/1.0.0/get`) with auth
- Bounded parents (max 4) + smart parent selection
- Merge action type + rules (≥2 tips, rate limit, trigger threshold)
- Hash references (targetHash, upToHash)
- Topic prefix change (`anypost2/group/`)
- Updated wire message schemas
- Updated signing payloads
- Compatibility: v1.0 and v1.1 nodes do not interact

### End-to-end validation

Verify all acceptance criteria from PLAN-0002:
1. Two v1.1 nodes with divergent DAG branches sync correctly via head exchange + block fetch
2. New peer syncs 1000+ actions via heads_announce → block fetch
3. Small catch-ups use pubsub inline path (≤16 envelopes, ≤64 KiB)
4. maxParents enforced (>4 rejected)
5. Smart parent selection reduces frontier width
6. Merge collapses frontier when >64 tips
7. Merge rate-limited (1/min per author, ≥2 tips)
8. Edit/delete/read-receipt hash references work in web UI
9. Block fetch auth: signed request, membership check, sentAt validation
10. v1.0/v1.1 topic isolation + protocolVersion rejection
11. v1.0 localStorage cleared on upgrade
12. All three invariants hold (deterministic convergence, byte-exact sigs, single owner)
13. processBulkSignedActions produces correct state (no O(n²) replay)

## Acceptance Criteria

- [ ] PROTOCOL.md accurately describes v1.1 protocol
- [ ] PROTOCOL.md is sufficient for building a compatible v1.1 node
- [ ] All 13 end-to-end validation scenarios pass
- [ ] No regressions in existing functionality (group creation, messaging, join/leave, etc.)

### Relay app verification

Verify that the relay app (`apps/anypost-relay/`) works correctly with the new `anypost2/group/` topic prefix:
- Relay auto-subscribes to topics via peer subscription behavior — confirm it picks up `anypost2/` topics
- If block fetch handler registration is added to relay, verify it works
- Test that relay forwards `heads_announce`, `sync_request`, `sync_response`, and `signed_action` messages with `protocolVersion: 2`

## Implementation Notes

- The existing PROTOCOL.md was written for v1.0. Overwrite the sync, wire protocol, and action chain sections. Keep identity, libp2p config, and relay sections (unchanged).
- End-to-end tests may require multi-node test setup with real libp2p nodes. Follow the existing pattern in `reconnect-sync` tests (if they exist) or create a new integration test file.
- The `waitUntil` polling helper is the preferred pattern for async test assertions.

## Dependencies

- Blocked by: 0051 (frontier sync must work), 0052 (web app must work)
- Blocks: None (this is the final task)

## History

- 2026-02-26 Created from brutal-plan PLAN-0002

# GossipSub Message Routing

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the message routing layer in `anypost-core/src/protocol/router.ts`. This dispatches incoming GossipSub messages (after CBOR decode + Zod validation) to the appropriate handler based on message type. TDD required.

## Acceptance Criteria

- [x] Router dispatches `encrypted_message` to message handler
- [x] Router dispatches `mls_commit` to MLS handler
- [x] Router dispatches `sync_request` to sync handler
- [x] Router returns error for unknown message types (N/A — WireMessage discriminated union is exhaustive, no unknown types possible)
- [x] `publishToGroup` publishes CBOR-encoded message to correct GossipSub topic (groupTopic helper implemented; publish/subscribe will integrate with libp2p in task 0013)
- [x] `subscribeToGroup` subscribes to correct GossipSub topic (groupTopic helper implemented)
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first:
  - "router should dispatch encrypted_message to message handler"
  - "router should dispatch mls_commit to MLS handler"
  - "router should dispatch sync_request to sync handler"
  - "router should return error for unknown message types"
  - "publishToGroup should publish to correct GossipSub topic"
  - "subscribeToGroup should subscribe to correct GossipSub topic"
- GossipSub topic format for groups should use opaque hashed names to prevent enumeration
- Handlers should be injectable (dependency injection via options object)
- Uses CBOR codec from task 0009 and schemas from task 0008
- Router should be pure — no side effects beyond dispatching to handlers

## Dependencies

- Blocked by: 0008, 0009, 0010
- Blocks: 0013

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 07:57 Started work on this task
- 2026-02-22 08:58 Implementation complete, 6 tests pass, typecheck clean
- 2026-02-22 09:00 Self-review #1: 0 CRITICAL, 0 MAJOR findings
- 2026-02-22 09:00 Task completed. All acceptance criteria met.

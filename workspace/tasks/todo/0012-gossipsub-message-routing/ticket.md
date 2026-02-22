# GossipSub Message Routing

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the message routing layer in `anypost-core/src/protocol/router.ts`. This dispatches incoming GossipSub messages (after CBOR decode + Zod validation) to the appropriate handler based on message type. TDD required.

## Acceptance Criteria

- [ ] Router dispatches `encrypted_message` to message handler
- [ ] Router dispatches `mls_commit` to MLS handler
- [ ] Router dispatches `sync_request` to sync handler
- [ ] Router returns error for unknown message types
- [ ] `publishToGroup` publishes CBOR-encoded message to correct GossipSub topic
- [ ] `subscribeToGroup` subscribes to correct GossipSub topic
- [ ] All tests pass via TDD

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

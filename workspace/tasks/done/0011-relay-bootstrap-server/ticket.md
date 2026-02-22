# Relay/Bootstrap Node.js Server

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the minimal relay/bootstrap Node.js server in `anypost-relay/`. This server provides WebSocket endpoints for browser peers to connect, Circuit Relay v2 for signaling, and GossipSub for message relay. It stores no messages and has no special privileges. TDD required.

## Acceptance Criteria

- [x] Relay node starts and listens on configured addresses (TCP + WebSocket)
- [x] Circuit Relay v2 server mode enabled
- [x] GossipSub enabled for message relay
- [x] Identify service enabled
- [x] Configurable listen addresses
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first:
  - "createRelayNode should start and listen on configured addresses"
  - "createRelayNode should enable circuit relay server"
  - "createRelayNode should enable GossipSub"
- Dependencies: `libp2p`, `@libp2p/tcp`, `@libp2p/websockets`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`, `@chainsafe/libp2p-gossipsub`, `@libp2p/identify`, `@libp2p/circuit-relay-v2`
- Relay is intentionally minimal — no message storage, no user management
- STUN server configuration needed for WebRTC NAT traversal
- Consider environment variable configuration for listen addresses and STUN servers

## Dependencies

- Blocked by: 0007
- Blocks: 0013

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 07:53 Started work on this task
- 2026-02-22 08:55 Implementation complete, all 7 tests pass, typecheck clean
- 2026-02-22 08:58 Self-review #1: 0 CRITICAL, 0 MAJOR findings
- 2026-02-22 08:58 Task completed. All acceptance criteria met.

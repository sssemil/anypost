# libp2p Browser Node Factory

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the browser libp2p node factory in `anypost-core/src/libp2p/create-node.ts`. This factory creates a configured libp2p node with all required transports, services, and discovery mechanisms for browser operation. TDD required (Vitest browser mode for real WebRTC/Crypto APIs).

## Acceptance Criteria

- [ ] `createBrowserNode` returns a started libp2p node
- [ ] WebRTC transport configured
- [ ] WebSocket transport configured (for relay connection)
- [ ] Circuit Relay v2 transport configured
- [ ] GossipSub service enabled
- [ ] Identify service enabled
- [ ] Node listens on `/webrtc` and `/p2p-circuit`
- [ ] Bootstrap peers configurable via options
- [ ] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — tests first (Vitest browser mode):
  - "createBrowserNode should return a started libp2p node"
  - "createBrowserNode should configure WebRTC transport"
  - "createBrowserNode should configure WebSocket transport"
  - "createBrowserNode should configure circuit relay transport"
  - "createBrowserNode should enable GossipSub service"
  - "createBrowserNode should enable identify service"
  - "createBrowserNode should listen on /webrtc and /p2p-circuit"
  - "createBrowserNode should use provided bootstrap peers"
- Use options object pattern for configuration
- Dependencies: `libp2p`, `@libp2p/webrtc`, `@libp2p/websockets`, `@libp2p/circuit-relay-v2`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`, `@chainsafe/libp2p-gossipsub`, `@libp2p/identify`, `@libp2p/dcutr`, `@libp2p/bootstrap`
- Browser mode tests may need special Vitest configuration

## Dependencies

- Blocked by: 0007
- Blocks: 0012, 0013

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

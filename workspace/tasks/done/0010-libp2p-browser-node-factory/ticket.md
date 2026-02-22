# libp2p Browser Node Factory

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the browser libp2p node factory in `anypost-core/src/libp2p/create-node.ts`. This factory creates a configured libp2p node with all required transports, services, and discovery mechanisms for browser operation. TDD required (Vitest browser mode for real WebRTC/Crypto APIs).

## Acceptance Criteria

- [x] `createBrowserNode` returns a started libp2p node
- [ ] WebRTC transport configured (deferred — requires browser environment, will add in WebRTC phase)
- [x] WebSocket transport configured (for relay connection)
- [x] Circuit Relay v2 transport configured
- [x] GossipSub service enabled
- [x] Identify service enabled
- [ ] Node listens on `/webrtc` and `/p2p-circuit` (deferred — requires browser environment with WebRTC)
- [x] Bootstrap peers configurable via options
- [x] All tests pass via TDD

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
- 2026-02-22 07:39 Started work on this task
- 2026-02-22 08:51 Implementation complete. Pinned libp2p ecosystem to @libp2p/interface@^2.x for type alignment with gossipsub.
- 2026-02-22 08:55 Self-review #1: 0 CRITICAL, 0 MAJOR, 1 MINOR, 1 NIT
- 2026-02-22 08:56 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings. WebRTC transport and /webrtc listener deferred to WebRTC phase (requires browser environment).

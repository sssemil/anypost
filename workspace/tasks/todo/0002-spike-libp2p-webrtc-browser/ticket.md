# Spike B: libp2p WebRTC Browser-to-Browser Through Relay

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 0 — Technical Spike

## Description

Validate that js-libp2p can establish browser-to-browser connections through a relay node using WebRTC. This is the foundational transport for the entire application.

Throwaway code — no TDD requirement for spikes.

Key things to validate:
- Two browser tabs can connect via a relay node
- Circuit Relay v2 works for SDP exchange
- WebRTC direct connection upgrades (DCUtR hole punching) work
- GossipSub messages flow between browser peers
- Connection lifecycle: connect, disconnect, reconnect
- STUN server configuration for NAT traversal

## Acceptance Criteria

- [ ] Relay node (Node.js) starts and accepts WebSocket connections from browsers
- [ ] Two browser tabs connect to relay and discover each other
- [ ] Browser-to-browser WebRTC connection established through relay signaling
- [ ] GossipSub pub/sub works between the two browsers
- [ ] Direct connection upgrade (hole punching) attempted and result documented
- [ ] Go/no-go recommendation documented

## Implementation Notes

- Use `@libp2p/webrtc` for browser transport, `@libp2p/websockets` for relay connection
- Relay needs `@libp2p/circuit-relay-v2` in server mode
- Browsers need `@libp2p/circuit-relay-v2` in transport mode
- Use `@libp2p/dcutr` for direct connection upgrade
- Use `@chainsafe/libp2p-gossipsub` for pub/sub
- Configure public STUN servers (Google's or deploy own)
- Test with browsers on same machine first, then different networks if possible
- Reference saved-v3's relay management patterns for inspiration

## Dependencies

- Blocked by: None
- Blocks: 0005, 0006

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

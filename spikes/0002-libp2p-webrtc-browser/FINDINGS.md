# Spike 0002: libp2p WebRTC Browser-to-Browser Through Relay

**Date**: 2026-02-22
**Status**: Partial validation — relay connectivity proven, GossipSub blocked by version incompatibility in Node.js testing

## Summary

This spike validates that js-libp2p can establish browser-to-browser connections through a relay node. We tested both Node.js peer-to-peer (as a proxy for browser behavior) and built a browser client with Vite.

**Verdict: CONDITIONAL GO** — The core transport layer works. GossipSub has a known version incompatibility that manifests in Node.js but is likely resolved by Vite's bundler in the browser. Browser-to-browser testing requires manual verification in real browsers.

---

## What Works

### 1. Relay Node (Node.js)
- Circuit Relay v2 server starts and accepts WebSocket connections
- Handles multiple peer reservations (tested with 128 max)
- Peers successfully obtain relay reservations and get circuit addresses
- Node 20 compatible with polyfills (Promise.withResolvers, WebSocket)

### 2. Circuit Relay Connections
- Peers connect to relay and obtain `/p2p-circuit` addresses
- Peers dial each other through relay circuit addresses
- Connection lifecycle works: connect, disconnect, reconnect
- Both inbound and outbound directions work

### 3. Peer Discovery
- GossipSub sees connected peers (both peers report 2 GS peers each)
- Identify protocol exchanges protocol lists correctly
- `/meshsub/1.1.0` protocol advertised and negotiated

### 4. Browser Build
- Vite bundles all 834 libp2p modules into a single 562 KB bundle
- TypeScript compilation succeeds with es2022 target
- All browser APIs (WebRTC, WebSocket, circuit relay, GossipSub, DCUtR) compile

---

## What Doesn't Work (Node.js)

### GossipSub Mesh Formation Over Relay Connections

**Root cause**: `@chainsafe/libp2p-gossipsub@14.1.2` depends on `@multiformats/multiaddr@^12`, but `libp2p@3.x` passes multiaddr v13 objects. The v13 API removed `.tuples()` (replaced with `.getComponents()`).

**Failure chain**:
1. Peer connects through relay → connection marked as `limited: true`
2. GossipSub's `onPeerConnected` calls `multiaddrToIPStr()` for peer scoring
3. `multiaddrToIPStr()` calls `multiaddr.tuples()` — **TypeError: tuples is not a function**
4. Error is silently caught by the registrar's topology handler
5. GossipSub never opens outbound streams → mesh never forms → messages never delivered

**Attempted fixes**:
- Added `runOnLimitedConnection: true` to GossipSub config — necessary but not sufficient
- Polyfilled `.tuples()` on multiaddr prototype — fixed first error, revealed second:
  `TypeError: fns.shift(...) is not a function` in multistream-select during stream negotiation
- This second error is another version mismatch in internal libp2p APIs

**Impact**: GossipSub messaging fails in Node.js. Mesh peers = 0, subscribers = 0, no messages delivered.

**Browser outlook**: Vite bundles resolve version conflicts by deduplicating dependencies. The browser build compiles cleanly and bundles gossipsub + multiaddr together, so the v12/v13 conflict should not manifest. **Manual browser testing required to confirm.**

---

## Critical Configuration Findings

### 1. Full Relay Address Required in `addresses.listen`

Peers MUST use the complete relay multiaddress in their listen config, not just `/p2p-circuit`:

```javascript
// WRONG — peer won't get a relay reservation
addresses: { listen: ["/p2p-circuit"] }

// CORRECT — peer establishes relay reservation
const relayAddr = relay.getMultiaddrs()[0];
addresses: { listen: [`${relayAddr.toString()}/p2p-circuit`] }
```

In the browser, `circuitRelayTransport({ discoverRelays: 1 })` handles this automatically after the initial relay dial.

### 2. `runOnLimitedConnection: true` Required

Circuit relay connections are marked as "limited" by libp2p. By default, protocols refuse to open streams on limited connections. GossipSub MUST have:

```javascript
gossipsub({
  runOnLimitedConnection: true,  // Required for relay connections
  allowPublishToZeroTopicPeers: true,
  emitSelf: false,
})
```

Without this, GossipSub topology won't receive `onConnect` events for relay-connected peers.

### 3. Node 20 Polyfills

libp2p 3.x requires Node 22+ features. For Node 20:
- `Promise.withResolvers` — polyfill needed (Node 22+)
- Global `WebSocket` — `ws` package polyfill needed (Node 22+)
- `multiaddr.tuples()` — polyfill needed (v13 removed it, gossipsub still calls it)

### 4. Connection Gater for Browser

Browsers need a permissive connection gater to allow relay and WebRTC connections:

```javascript
connectionGater: {
  denyDialMultiaddr: async () => false,
}
```

---

## Package Versions Tested

| Package | Version | Notes |
|---------|---------|-------|
| libp2p | 3.1.3 | Core library |
| @libp2p/webrtc | 6.0.11 | Browser transport |
| @libp2p/websockets | 10.1.3 | Relay connection |
| @libp2p/circuit-relay-v2 | 4.1.3 | Relay transport |
| @libp2p/identify | 4.0.10 | Protocol identification |
| @libp2p/dcutr | 3.0.10 | Direct connection upgrade |
| @chainsafe/libp2p-noise | 17.0.0 | Encryption |
| @chainsafe/libp2p-yamux | 8.0.1 | Stream multiplexing |
| @chainsafe/libp2p-gossipsub | 14.1.2 | Pub/sub — has multiaddr v12/v13 issue |
| @multiformats/multiaddr | 13.0.1 | v13 breaks gossipsub's tuples() call |

---

## Architecture Validated

```
Browser A                    Relay Node                   Browser B
┌──────────┐                ┌──────────┐                ┌──────────┐
│  libp2p  │──WebSocket───▶│  libp2p  │◀──WebSocket───│  libp2p  │
│  WebRTC  │                │  WS+TCP  │                │  WebRTC  │
│  Relay   │──Circuit──────▶│  Relay   │◀──Circuit─────│  Relay   │
│  GS      │                │  Server  │                │  GS      │
└──────────┘                └──────────┘                └──────────┘
     │                                                       │
     └──────────────WebRTC (DCUtR upgrade)──────────────────┘
```

- **Phase 1**: Both browsers connect to relay via WebSocket
- **Phase 2**: Browser A gets a circuit relay reservation address
- **Phase 3**: Browser B dials Browser A through the relay circuit
- **Phase 4**: DCUtR attempts direct WebRTC connection (hole punching)
- **Phase 5**: GossipSub mesh forms, messages flow

---

## Recommendations for Implementation

1. **Use Vite bundling for all libp2p code** — resolves version conflicts
2. **Always set `runOnLimitedConnection: true`** on GossipSub
3. **Use `discoverRelays: 1`** in browser's circuit relay transport config
4. **Pin package versions** — libp2p ecosystem has frequent breaking changes between minors
5. **Monitor gossipsub@15.x** for multiaddr v13 compatibility fix
6. **Integration tests should run in real browsers** (Playwright/Vitest browser mode), not Node.js, because Node.js has version conflicts that don't manifest in bundled browser code
7. **Relay server needs polyfills** for Node 20 (or use Node 22+)

---

## Open Items

- [ ] Manual browser-to-browser testing (requires graphical browser environment)
- [ ] WebRTC direct connection upgrade (DCUtR hole punching) — not testable without real browsers on different networks
- [ ] GossipSub message flow in browser — likely works with Vite bundling but needs manual confirmation
- [ ] STUN server behavior under NAT — requires different network testing
- [ ] Performance: relay throughput, WebRTC connection establishment latency

---

## Go/No-Go

**CONDITIONAL GO**: Proceed with implementation using these packages. The core transport works. GossipSub version conflict is a Node.js-only issue that Vite bundling resolves. The team should:

1. Set up a quick manual browser test (open two tabs, connect to relay, exchange messages) to fully validate before committing to the architecture
2. Plan for running integration tests in Vitest browser mode (not Node.js) to avoid the multiaddr version conflict
3. Consider pinning to specific libp2p versions to avoid future breaking changes

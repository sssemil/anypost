# Phase 0 Go/No-Go Decision

**Date**: 2026-02-22
**Status**: All spikes complete. **GREEN LIGHT to proceed to Phase 1.**

---

## Decision Summary

| Dependency | Verdict | Version/Approach | Confidence |
|-----------|---------|------------------|-----------|
| ts-mls | **GO** | v2.0.0-rc.8 | HIGH |
| libp2p WebRTC | **CONDITIONAL GO** | libp2p 3.1.3, pin all versions | MEDIUM |
| Yjs CRDTs | **GO** | yjs 13.x + y-protocols | HIGH |
| DMLS | **DEFER** | Steward model for v1 | HIGH |
| Integration | **GO** | Architecture validated | HIGH |

**Overall: GO** — Proceed to Phase 1 (Foundation).

---

## 1. ts-mls — GO (v2.0.0-rc.8)

**Spike**: 0001-ts-mls-browser
**Confidence**: HIGH

### Decision

Use ts-mls v2.0.0-rc.8 with ciphersuite `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

### Rationale

- All MLS lifecycle operations work: group creation, member add/remove, encrypt/decrypt, key packages, welcome messages
- Performance is excellent: avg 0.54ms encrypt, 0.55ms decrypt (18x under 10ms target)
- Bundle size is reasonable: 155 KB raw / 46 KB gzipped
- State serialization works (critical bug in v1.6.1 fixed in v2.0.0-rc.8)
- Browser-native: no Node.js-only dependencies, works with Web Crypto API

### Risk

v2.0.0-rc.8 is a release candidate — API may change before final release.

**Mitigation**: Wrap ts-mls behind an abstraction layer in `packages/crypto`. The API surface we use is small (createGroup, joinGroup, createCommit, createApplicationMessage, processMessage, generateKeyPackage, encode/decode). Changes should be localized.

### Required Peer Dependencies

`@noble/hashes` and `@noble/curves` must be installed explicitly — ts-mls doesn't declare them.

### Key Discovery (Spike 0005)

MLS messages are structured objects, not raw bytes. Wire serialization requires `encode(mlsMessageEncoder, msg)` / `decode(mlsMessageDecoder, bytes)`. This must be handled at the protocol layer boundary.

---

## 2. libp2p WebRTC — CONDITIONAL GO

**Spike**: 0002-libp2p-webrtc-browser
**Confidence**: MEDIUM

### Decision

Use js-libp2p 3.1.3 with WebRTC + WebSocket + Circuit Relay v2. Pin all package versions.

### What Works

- Relay node with Circuit Relay v2 server
- Peer-to-peer connections through relay
- Connection lifecycle (connect, disconnect, reconnect)
- Browser build compiles cleanly via Vite (834 modules → 562 KB)
- Identify protocol and peer discovery

### What Doesn't Work (Node.js only)

GossipSub mesh formation fails in Node.js due to `@chainsafe/libp2p-gossipsub@14.1.2` calling `multiaddr.tuples()` which was removed in multiaddr v13. This is a **Node.js-only issue** — Vite bundling resolves it by deduplicating dependencies.

### Condition

Manual browser-to-browser test must confirm GossipSub works in the browser before Phase 1 is complete. This can happen in parallel with monorepo scaffolding.

### Critical Configuration

1. Full relay address required in `addresses.listen`: `${relayAddr}/p2p-circuit`
2. `runOnLimitedConnection: true` on GossipSub config
3. `connectionGater: { denyDialMultiaddr: async () => false }` for browser
4. Relay node needs polyfills for Node 20 (or use Node 22+)

### Testing Implication

**All integration tests must run in Vitest browser mode, not Node.js.** The GossipSub version incompatibility and stream API issues are Node.js-specific. This means:
- Unit tests for pure logic: Vitest (Node.js) — fine
- Tests touching libp2p, GossipSub, or streams: Vitest browser mode — required
- E2E tests: Playwright — required

---

## 3. Yjs CRDTs — GO

**Spike**: 0003-yjs-over-gossipsub
**Confidence**: HIGH

### Decision

Use Yjs 13.x with y-protocols for CRDT sync. Build a custom `YjsLibp2pProvider` for transport.

### Validated Behaviors (31/31 tests)

- Y.Array, Y.Map, Y.Text all work correctly
- Sync protocol (state vector exchange + missing updates) works
- Concurrent edits from multiple peers merge deterministically
- Updates are idempotent (safe for GossipSub at-least-once delivery)
- Real-time update broadcasting via `doc.on("update")` works
- Wire format is efficient: ~46 bytes per message update, 8 bytes state vector

### Sync Architecture

| Transport | Purpose |
|-----------|---------|
| GossipSub topic per group | Real-time update broadcasting |
| Direct libp2p stream `/anypost/yjs-sync/1.0.0` | State vector exchange (catch-up) |
| y-indexeddb | Local persistence |

### Key Pattern

```javascript
// Outbound: broadcast local changes
doc.on("update", (update, origin) => {
  if (origin !== "remote") {
    gossipsub.publish(topic, update);
  }
});

// Inbound: apply remote changes without re-broadcasting
Y.applyUpdate(doc, receivedUpdate, "remote");
```

The `"remote"` origin parameter is critical to prevent broadcast loops.

---

## 4. DMLS — DEFER (Steward Model for v1)

**Spike**: 0004-dmls-investigation
**Confidence**: HIGH

### Decision

**Do not implement DMLS for v1.** Use the steward model with automatic failover.

### Rationale

Two competing "DMLS" approaches exist:
1. **draft-kohbrok (DAG + PPRFs)**: Requires forking ts-mls at the key schedule level. No TypeScript implementation exists. Research-grade.
2. **draft-xue (Send Groups)**: Simpler but O(n) storage per member. Could work with ts-mls API but adds significant complexity.

Neither is viable for v1:
- No TypeScript implementation exists for either approach
- draft-kohbrok requires forking ts-mls (key schedule changes)
- Both specs are Individual Drafts, may change significantly
- Fork resolution requires a separate consensus mechanism anyway

### Steward Model Design

1. **Single steward** (group creator initially) serializes all MLS commits
2. **Deterministic election**: If steward offline (no commit within timeout), member with lowest leaf index becomes steward. All members agree because they share group state.
3. **Emergency escalation**: After longer timeout, any online member can commit. "First seen wins" for concurrent commits.
4. **Steward transfer**: Explicit proposal to hand off steward role

This approach:
- Uses ts-mls as-is (no fork)
- Preserves full Forward Secrecy and Post-Compromise Security
- Has precedent: Cloudflare Orange Meets (formally verified with TLA+)

### Future Path

| Trigger | Action |
|---------|--------|
| Single-steward UX problems | Multi-steward (k-of-n voting) |
| DMLS spec stabilizes + TS library emerges | Evaluate full DMLS |
| draft-kohbrok gets WG adoption | Higher priority for evaluation |

---

## 5. Integration — GO

**Spike**: 0005-integration-test
**Confidence**: HIGH

### Decision

The core message flow is validated end-to-end. Architecture proceeds as designed.

### Validated Flow (37/37 assertions)

```
Sender:
  1. MLS encrypt (createApplicationMessage)     → 0.60ms
  2. Wire serialize (mlsMessageEncoder)         → included
  3. GossipSub publish (encrypted payload)      → ~0ms (simulated)
  4. Yjs metadata insert (Y.Array push)         → 0.03ms

Receiver:
  1. GossipSub receive (wire bytes)             → ~0ms (simulated)
  2. Wire deserialize (mlsMessageDecoder)       → included
  3. MLS decrypt (processMessage)               → 0.61ms
  4. Yjs metadata received (auto-sync)          → ~0ms
```

**Total E2E pipeline: avg 1.26ms, p95 1.65ms, 100% under 10ms.**

### Wire Format Sizes

| Data | Size |
|------|------|
| Encrypted message wire payload | ~330 bytes (for 36-char plaintext) |
| MLS overhead per message | ~290 bytes |
| Yjs metadata per message | ~73 bytes |
| Yjs state for 50 messages | 3,668 bytes |
| MLS client state | ~1,500 bytes |

### Two GossipSub Topics Per Group

| Topic | Payload |
|-------|---------|
| `anypost.group.<id>` | MLS encrypted wire bytes |
| `anypost.yjs.<id>` | Yjs CRDT update bytes |

Both carry raw `Uint8Array`. No additional framing needed.

---

## Plan Adjustments

Based on spike findings, the following changes to PLAN-0001:

### 1. MLS Version Confirmed

ts-mls v2.0.0-rc.8. Update plan references from "version decided in spike" to v2.0.0-rc.8.

### 2. DMLS → Steward Model

Replace all DMLS references in Phase 3 with steward model. Phase 3b becomes:
- MLS group lifecycle with steward commit ordering
- Steward election and failover (can be deferred to Phase 6)

### 3. Testing Environment

Add to implementation notes:
- Unit tests for pure logic: Vitest (Node.js)
- Tests touching libp2p/GossipSub: Vitest browser mode
- E2E tests: Playwright
- Node.js polyfills needed for relay server on Node 20

### 4. Wire Serialization Layer

Protocol layer must handle MLS message serialization via `mlsMessageEncoder`/`mlsMessageDecoder` at the transport boundary. This is a new implementation detail not in the original plan.

### 5. GossipSub Configuration

Document required GossipSub config:
- `runOnLimitedConnection: true`
- `allowPublishToZeroTopicPeers: true`
- `emitSelf: false`

### 6. Peer Dependency Management

Pin all libp2p ecosystem packages to exact versions. The ecosystem has frequent breaking changes between minor versions.

---

## Risk Register Update

| Risk | Status | Notes |
|------|--------|-------|
| ts-mls has critical bugs | MITIGATED | v2.0.0-rc.8 validated, v1.6.1 serialization bug confirmed and avoided |
| DMLS proves infeasible in TS | CONFIRMED | Both approaches infeasible for v1; steward model chosen |
| WebRTC hole-punching fails often | UNCHANGED | Circuit relay fallback works; needs real browser testing |
| GossipSub version incompatibility | NEW | Node.js only; Vite bundling resolves; tests must use browser mode |
| MLS wire serialization not obvious | NEW | Discovered in spike 0005; mlsMessageEncoder/Decoder required |
| libp2p stream API changes (v3.x) | NEW | EventTarget-based API has race conditions in Node.js; browser OK |
| Yjs memory growth in active groups | UNCHANGED | Compact wire format validated (~73 bytes/msg metadata) |

---

## Next Steps

1. **Manual browser test** (parallel with Phase 1): Open two browser tabs, connect through relay, exchange GossipSub messages. Confirms spike 0002's conditional GO.
2. **Phase 1 begins**: Monorepo scaffolding (task 0007) is the first implementation task.
3. All production code follows TDD from this point forward.

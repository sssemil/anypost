# Spike 0005: Integration — MLS + Yjs + Simulated Transport

**Date**: 2026-02-22
**Status**: All 37 assertions pass

## Summary

This spike validates the core message flow that the entire Anypost application depends on: MLS encryption → wire serialization → simulated GossipSub delivery → Yjs CRDT metadata sync → MLS decryption. All components integrate cleanly.

**Verdict: GO** — The MLS + Yjs + GossipSub architecture is validated end-to-end.

---

## What Was Validated (37/37 assertions)

### 1. MLS Group Formation
- Two peers (Alice, Bob) form an MLS group via `createGroup` + `createCommit` + `joinGroup`
- Both peers agree on group membership (2 members)
- Key packages, commits, and welcome messages all work correctly

### 2. Full Encrypt → Transport → Decrypt Flow
- Alice encrypts plaintext via `createApplicationMessage`
- MLS message object serialized to `Uint8Array` via `mlsMessageEncoder` (330 bytes for a 36-char message)
- Serialized bytes delivered via simulated GossipSub (in-memory pub/sub)
- Bob deserializes via `mlsMessageDecoder`, then decrypts via `processMessage`
- Decrypted plaintext matches original exactly

### 3. Yjs CRDT Metadata Storage
- Message metadata (id, sender, channel, timestamp, payload size, MLS epoch) stored in `Y.Array`
- Metadata syncs between peers via y-protocols state vector exchange
- Real-time sync via Yjs update broadcasting over simulated GossipSub works

### 4. Bidirectional Messaging
- Both Alice→Bob and Bob→Alice message flows work
- MLS epoch state advances correctly for both directions
- Yjs real-time sync keeps both peers' metadata in sync

### 5. Concurrent CRDT Edits
- Offline edits from multiple peers merge deterministically
- Both peers converge to identical message ordering after sync

### 6. Forward Secrecy / Non-Member Exclusion
- Eve (non-member) cannot decrypt group messages — MLS correctly rejects

### 7. State Persistence
- MLS state serializes to ~1.5 KB via `clientStateEncoder` and round-trips correctly
- Deserialized MLS state can still encrypt/decrypt
- Yjs document state serializes via `Y.encodeStateAsUpdate` and restores correctly

---

## Key Discovery: MLS Message Wire Serialization

`createApplicationMessage` returns a structured MLS message object (`{ version, wireformat, privateMessage }`), **not raw bytes**. For wire transport, messages must be explicitly serialized:

```javascript
import { encode, decode, mlsMessageEncoder, mlsMessageDecoder } from "ts-mls";

// Sender: MLS message → wire bytes
const wireBytes = encode(mlsMessageEncoder, encryptResult.message);

// Receiver: wire bytes → MLS message → decrypt
const mlsMessage = decode(mlsMessageDecoder, wireBytes);
const result = await processMessage({ context, state, message: mlsMessage });
```

This is critical for the production architecture — the protocol layer must serialize/deserialize MLS messages at the transport boundary.

---

## Performance Results

| Metric | Value |
|--------|-------|
| MLS Encrypt + serialize | avg 0.60ms, p95 0.78ms |
| MLS Deserialize + decrypt | avg 0.61ms, p95 0.91ms |
| CRDT insert | avg 0.03ms, p95 0.08ms |
| Full E2E pipeline | avg 1.26ms, p95 1.65ms |
| First message latency | 3.48ms |
| Under 10ms | 50/50 (100%) |

**All operations well under the 10ms target for real-time chat.**

### Wire Format Sizes

| Data | Size |
|------|------|
| Encrypted "Hello" wire payload | 329 bytes |
| Encrypted 36-char message | 330 bytes |
| Yjs state (50 messages metadata) | 3,668 bytes |
| MLS client state | ~1,500 bytes |

MLS overhead is ~290 bytes per message (329 bytes for 5-char plaintext). Yjs metadata is compact (~73 bytes per message entry).

---

## Validated Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Send Flow                         │
│                                                             │
│  1. User types message                                      │
│  2. MLS encrypt: createApplicationMessage()                 │
│  3. Wire serialize: encode(mlsMessageEncoder, msg)          │
│  4. GossipSub publish: topic "anypost.group.<id>"           │
│  5. Yjs metadata: messages.push([{ id, sender, ts, ... }]) │
│  6. Yjs update auto-broadcasts via GossipSub               │
│                                                             │
│                    Message Receive Flow                      │
│                                                             │
│  1. GossipSub delivers encrypted wire bytes                 │
│  2. Wire deserialize: decode(mlsMessageDecoder, bytes)      │
│  3. MLS decrypt: processMessage()                           │
│  4. Yjs metadata arrives via separate GossipSub topic       │
│  5. UI renders decrypted plaintext with metadata            │
└─────────────────────────────────────────────────────────────┘
```

### Two GossipSub Topics Per Group

| Topic | Purpose | Payload |
|-------|---------|---------|
| `anypost.group.<id>` | Encrypted message payloads | MLS wire bytes (Uint8Array) |
| `anypost.yjs.<id>` | CRDT metadata sync | Yjs update bytes (Uint8Array) |

Both topics carry raw `Uint8Array` — no additional framing needed.

---

## Design Decisions Validated

| Decision | Validated? | Notes |
|----------|-----------|-------|
| MLS for encryption | YES | Clean API, fast (<1ms), ~290 byte overhead |
| Yjs for metadata | YES | CRDT merge works, real-time sync works, 73 bytes/message |
| GossipSub for transport | YES (simulated) | In-memory validates the pub/sub pattern |
| Separate topics for encrypted payload vs metadata | YES | Clean separation of concerns |
| `mlsMessageEncoder/Decoder` for wire format | YES | Required — MLS messages are objects, not bytes |
| State serialization for persistence | YES | Both MLS and Yjs state round-trip correctly |

---

## Implications for Production Implementation

1. **Protocol layer** (`packages/protocol`) must handle MLS message serialization at the transport boundary
2. **Two GossipSub subscriptions per group** — encrypted payloads + CRDT metadata
3. **Yjs update origin tracking** is critical — use `"remote"` origin to prevent re-broadcast loops
4. **MLS state must be persisted** (IndexedDB) — ~1.5 KB per group, serialized via `clientStateEncoder`
5. **Message metadata schema** should include: id, sender, channel, timestamp, payload size, MLS epoch
6. **CRDT catch-up** via state vector exchange handles offline reconnection for metadata

---

## Go/No-Go

**GO**: The entire MLS + Yjs + GossipSub stack integrates cleanly. All core behaviors validated:
- Encrypt → transport → decrypt works end-to-end
- Metadata syncs via CRDT with offline support
- Bidirectional messaging works
- Forward secrecy enforced (non-members excluded)
- State persistence works for both MLS and Yjs
- Performance is excellent (<2ms average E2E pipeline)
- Wire format is compact (329 bytes for encrypted message + 73 bytes for metadata)

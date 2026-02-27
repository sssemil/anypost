# Anypost Protocol Specification

> Version: 1.1 (protocolVersion: 2) — derived from the reference implementation as of 2026-02-27.
> Sufficient to build a compatible node from scratch using any libp2p implementation.
>
> **Breaking change from v1.0**: v1.1 uses a different topic prefix (`anypost2/group/` vs `anypost/group/`) and `protocolVersion: 2` in wire messages. v1.0 and v1.1 nodes do not interact.

---

## 1. Identity & Cryptography

### Account Keys

- **Algorithm**: Ed25519 (RFC 8032)
- **Private key**: 32 random bytes (seed)
- **Public key**: `ed25519.getPublicKey(seed)` — 32 bytes
- **Key backup**: BIP-39 mnemonic (English wordlist) encoding the 32-byte seed

```
AccountKey = { publicKey: Uint8Array(32), privateKey: Uint8Array(32) }
```

### Device Certificates

Binds a libp2p PeerId to an account public key.

```
CertificatePayload = CBOR({ devicePeerId: string, accountPublicKey: Uint8Array, timestamp: number })
signature = Ed25519.sign(CertificatePayload, accountPrivateKey)
```

Verification: reject if `timestamp > now + 5min` or `now - timestamp > 365 days`.

### Hex Encoding Convention

Public keys and action hashes are converted to lowercase hex strings for use as map keys:

```
toHex(bytes) = bytes.map(b => b.toString(16).padStart(2, '0')).join('')
fromHex(hex) = Uint8Array from pairs of hex characters (rejects odd-length or non-hex input)
```

---

## 2. libp2p Network Layer

### 2.1 Transports

| Runtime | Transports | Listen Addresses |
|---------|-----------|-----------------|
| **Browser** | WebSocket (unfiltered), WebRTC (Google STUN), Circuit Relay client | `/p2p-circuit`, `/webrtc` |
| **Desktop** | TCP, WebSocket, WebRTC, Circuit Relay client | `/ip4/0.0.0.0/tcp/0`, `/ip4/0.0.0.0/tcp/0/ws`, `/p2p-circuit`, `/webrtc` |
| **Relay server** | TCP, WebSocket | `/ip4/0.0.0.0/tcp/9001`, `/ip4/0.0.0.0/tcp/9090/ws` |

- **Encryption**: Noise protocol
- **Muxer**: Yamux
- **WebRTC STUN**: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`

### 2.2 Services

All nodes: `identify`, `ping`.
Clients additionally: `dcutr` (direct connection upgrade).
Relay servers additionally: `circuitRelayServer` (maxReservations: 128).

### 2.3 GossipSub

```
D=6  Dlo=4  Dhi=12  Dlazy=6
gossipThreshold=-100  publishThreshold=-1000  graylistThreshold=-10000
floodPublish=true  allowPublishToZeroTopicPeers=true  runOnLimitedConnection=true
```

Relay servers set `canRelayMessage: true`. When `peerCount < 6`, nodes use floodsub semantics.

### 2.4 Kademlia DHT

- **Browser/Desktop**: Client mode (`clientMode: true`)
- **Relay server**: Server mode (`clientMode: false`)

#### Namespace CIDs

CIDs for DHT provider records are created as:

```
bytes = UTF8.encode(namespace)
hash = multiformats.sha256.digest(bytes)
cid = CID.createV1(raw.code, hash)
```

| Namespace | Purpose |
|-----------|---------|
| `anypost-relay` | Discover relay servers |
| `anypost/group/{groupId}` | Per-group peer discovery |

### 2.5 Peer Discovery (Multi-Layer)

**Layer A — Bootstrap**: IPFS WSS bootstrap peers (browser) or TCP dnsaddr peers (relay).

**Layer B — PubSub Peer Discovery** (`@libp2p/pubsub-peer-discovery`):
- Topics: `_peer-discovery._p2p._pubsub`, `anypost/_peer-discovery`
- Interval: 10 seconds
- Both advertise and listen

**Layer C — Group DHT Discovery**:
- On group join: `contentRouting.provide(groupCid)`
- Search schedule: immediate, then 5s, then every 15s ongoing
- Max 128 tracked peers per group; 24h expiry

**Layer D — Circuit Relay Harvest**:
- Parse `self:peer:update` multiaddrs for circuit relay addresses
- Extract relay base address from `/p2p/{relayPeerId}/p2p-circuit/...` patterns

---

## 3. Wire Protocol

### 3.1 Encoding

All GossipSub messages are **CBOR-encoded** (library: `cbor-x`).

```
encode: WireMessage → CBOR → Uint8Array
decode: Uint8Array → CBOR → Zod.parse(WireMessageSchema) → WireMessage
```

### 3.2 Topics

```
Group topic:            anypost2/group/{groupId}       (groupId = UUID)
Device discovery topic: anypost/account/{pubKeyHex}/devices
```

**Note**: The group topic prefix is `anypost2/` (not `anypost/`). This ensures v1.0 and v1.1 nodes operate on separate topics and do not interact.

### 3.3 Wire Message Types

All messages are a discriminated union on `type`. Messages involved in group sync include a `protocolVersion: 2` field for version validation.

#### `signed_action` — Action chain entry

```
{
  type: "signed_action",
  protocolVersion: 2,
  signedBytes: Uint8Array,
  signature: Uint8Array,
  hash: Uint8Array
}
```

Published on the group topic. This is the primary message type for all group activity (messages, membership changes, etc.). See Section 4.

#### `join_request` — Membership request (via GossipSub)

```
{
  type: "join_request",
  protocolVersion: 2,
  groupId: UUID,
  senderPeerId: string,
  requesterPublicKey: Uint8Array,
  signature: Uint8Array,
  inviteGrant?: InviteGrantProof
}
```

#### `heads_announce` — DAG frontier announcement

```
{
  type: "heads_announce",
  protocolVersion: 2,
  payload: {
    groupId: UUID,
    heads: Uint8Array[],           // current DAG tips (max 64)
    approxDagSize?: number,        // approximate action count
    sentAt: number,                // timestamp
    senderPeerId: string,
    senderPublicKey: Uint8Array,
    signature: Uint8Array
  }
}
```

Published periodically and after state changes. Recipients compare against their local DAG to detect missing actions. See Section 5.

#### `sync_request` — Request missing actions

```
{
  type: "sync_request",
  protocolVersion: 2,
  payload: {
    groupId: UUID,
    senderPeerId: string,
    senderPublicKey: Uint8Array,
    signature: Uint8Array,
    requestId?: UUID,
    targetPeerId?: string,
    knownHeads: Uint8Array[]       // requester's current DAG tips (max 64)
  }
}
```

#### `sync_response` — Reply with missing actions

```
{
  type: "sync_response",
  protocolVersion: 2,
  payload: {
    groupId: UUID,
    senderPeerId: string,
    senderPublicKey: Uint8Array,
    signature: Uint8Array,
    requestId?: UUID,
    targetPeerId: string,
    theirHeads: Uint8Array[],      // responder's current DAG tips (max 64)
    envelopes: SignedActionEnvelope[]  // max 16 envelopes or 64 KiB
  }
}
```

#### `dm_request` — Direct message invitation

```
{
  type: "dm_request",
  payload: {
    requestId: UUID, senderPeerId, senderPublicKey, targetPeerId,
    groupId: UUID, groupName: string, inviteCode: string,
    sentAt: number, signature: Uint8Array
  }
}
```

#### `join_request_direct` — Direct join request (point-to-point)

```
{
  type: "join_request_direct",
  protocolVersion: 2,
  payload: {
    groupId: UUID, senderPeerId, requesterPublicKey, targetPeerId,
    signature: Uint8Array, inviteGrant?: InviteGrantProof
  }
}
```

#### `profile_request` / `profile_announce` — User profiles

```
profile_request:  { requestId, senderPeerId, senderPublicKey, targetPeerId, sentAt, signature }
profile_announce: { senderPeerId, senderPublicKey, targetPeerId?, displayName (1-100 chars), sentAt, signature }
```

#### `call_control` — Voice call signaling

```
{
  type: "call_control",
  payload: {
    action: "call-started"|"call-ring"|"call-accept"|"call-decline"|"call-join"|"call-leave"|"call-heartbeat"|"call-end"|"call-nudge",
    groupId: UUID, senderPeerId, senderPublicKey,
    targetPeerId?, muted?, sentAt, signature
  }
}
```

#### `encrypted_message` / `mls_commit` — (reserved for future E2EE)

```
encrypted_message: { payload: { id, groupId, channelId, senderPeerId, senderDisplayName?, epoch, ciphertext, timestamp } }
mls_commit:        { payload: { groupId, epoch, commitData, senderPeerId } }
```

### 3.4 Invite Grant Proofs

```
InviteGrantProof = {
  claims: TargetedPeerClaims | OpenClaims,
  issuerPublicKey: Uint8Array,
  signature: Uint8Array
}

TargetedPeerClaims = { kind: "targeted-peer", tokenId: UUID, groupId: UUID, issuedAt, targetPeerId }
OpenClaims         = { kind: "open", tokenId: UUID, groupId: UUID, issuedAt, expiresAt?, maxJoiners? }
```

---

## 4. Signed Action Chain

The core data model. All group state is derived by replaying a cryptographically signed, content-addressed DAG of actions.

### 4.1 Data Structures

#### SignableAction

```
{
  protocolVersion: 2,              // literal value, always 2
  id:              UUID,
  groupId:         UUID,
  authorPublicKey: Uint8Array(32), // Ed25519 public key
  timestamp:       number,         // ms since epoch
  parentHashes:    Uint8Array(32)[], // 1-4 references to parent action hashes
  payload:         ActionPayload   // see 4.2
}
```

**Bounded parents**: `parentHashes` must contain 1 to 4 entries. Actions with more than 4 parents are rejected.

#### SignedActionEnvelope (wire format)

```
{
  signedBytes: Uint8Array,   // CBOR(SignableAction) — preserved exactly
  signature:   Uint8Array,   // Ed25519.sign(signedBytes, privateKey)
  hash:        Uint8Array    // SHA-256(signedBytes)
}
```

**Critical**: signature is verified against the exact `signedBytes`, never re-encoded. This avoids CBOR non-determinism issues.

#### SignedAction (runtime, after verification)

```
SignableAction & { signature: Uint8Array, hash: Uint8Array }
```

### 4.2 Action Payload Types

14 variants, discriminated on `type`:

| Type | Fields | Purpose |
|------|--------|---------|
| `group-created` | `groupName: string`, `joinPolicy?: "manual"\|"auto_with_invite"` | Genesis action, author becomes owner |
| `dm-created` | `peerIds: [string, string]` (sorted ascending) | DM genesis, both peers must emit |
| `join-request` | `requesterPublicKey: Uint8Array` | Request to join group |
| `member-approved` | `memberPublicKey: Uint8Array`, `role: "admin"\|"member"`, `inviteTokenId?: UUID` | Admin approves pending member |
| `member-left` | *(none)* | Author voluntarily leaves |
| `member-removed` | `memberPublicKey: Uint8Array` | Admin removes member |
| `role-changed` | `memberPublicKey: Uint8Array`, `newRole: "owner"\|"admin"\|"member"` | Owner changes role |
| `group-renamed` | `newName: string` | Admin renames group |
| `join-policy-changed` | `joinPolicy: "manual"\|"auto_with_invite"` | Admin changes join policy |
| `message` | `text: string` | Send message |
| `message-edited` | `targetHash: Uint8Array`, `newText: string` | Edit previous message (by hash) |
| `message-deleted` | `targetHash: Uint8Array` | Delete previous message (by hash) |
| `read-receipt` | `upToHash: Uint8Array` | Mark messages as read (by hash) |
| `merge` | *(none)* | DAG compaction; must reference ≥2 current tips |

**Hash references**: `message-edited`, `message-deleted`, and `read-receipt` reference target actions by their SHA-256 hash (`Uint8Array`), not by UUID.

### 4.3 Signing & Verification

#### Create

```
1. Build SignableAction object (with protocolVersion: 2)
2. signedBytes = CBOR.encode(signableAction)
3. signature   = Ed25519.sign(signedBytes, accountKey.privateKey)
4. hash        = SHA-256(signedBytes)
5. Return { signedBytes, signature, hash }
```

#### Verify

```
1. Compute SHA-256(envelope.signedBytes), compare to envelope.hash → reject on mismatch
2. CBOR.decode(envelope.signedBytes) → validate against SignableAction schema
3. Ed25519.verify(envelope.signature, envelope.signedBytes, decoded.authorPublicKey) → reject if false
4. Return decoded action with signature and hash attached
```

### 4.4 DAG Structure

Actions form a directed acyclic graph via `parentHashes`.

**State**:
```
ActionDagState = {
  actions:   Map<hexHash, SignedAction>,
  tipHashes: Set<hexHash>             // actions with no children
}
```

**Append** (idempotent):
```
appendAction(state, action):
  if actions.has(toHex(action.hash)) → return same state (dedup)
  add action to actions
  remove action's parents from tipHashes
  add action's hash to tipHashes
```

**Genesis**: The first action's `parentHashes` contains `GENESIS_HASH` (32 zero bytes).

**Tips**: `getTips(state)` returns hashes of all current leaf actions.

#### Smart Parent Selection

When creating a new action, parents are selected using `selectParentHashes(dag, lastBuiltHead, maxParents=4)`:

1. Get all current DAG tips
2. If no tips: return `[GENESIS_HASH]`
3. Sort tips by `(timestamp ASC, hexHash ASC)`
4. If `lastBuiltHead` (the hash of the author's most recent action) is still a tip: place it first, then fill remaining slots from other sorted tips (up to `maxParents`)
5. Otherwise: return first `maxParents` tips from sorted list

This gives priority to continuing the author's own chain, reducing unnecessary branching.

### 4.5 Topological Ordering

Kahn's algorithm with deterministic tiebreaker:

1. Compute in-degree for each action (ignoring GENESIS_HASH parents)
2. Initialize queue with all zero-in-degree actions
3. Sort queue by `(timestamp ASC, hexHash ASC)`
4. Process queue: dequeue, emit, decrement children's in-degree, enqueue newly-ready children (re-sort)

**Guarantee**: Two nodes with identical action sets produce identical ordering.

### 4.6 Authorization Rules

State is derived by replaying actions in topological order. Each action is validated against current state; failures are silently skipped.

**Group State**:
```
{
  groupId, groupName, isDirectMessage, directMessagePeerIds,
  dmGenesisContributorPublicKeys: Set<hex>,
  dmHandshakeComplete: boolean,
  joinPolicy: "manual" | "auto_with_invite",
  createdAt, members: Map<hex, GroupMember>,
  pendingJoins: Map<hex, Uint8Array>,
  readReceipts: Map<hex, hexHash>
}

GroupMember = { publicKeyHex, publicKey, role: "owner"|"admin"|"member", joinedAt }
```

**Note**: `readReceipts` maps author hex → target hash hex (not UUID).

**Permission Matrix**:

| Action | Requirement |
|--------|------------|
| `group-created` | State has no members yet |
| `dm-created` | Not overriding a non-DM group; peer IDs sorted ascending |
| `join-request` | Author not already member; not a DM |
| `member-approved` | Author is admin or owner; not a DM |
| `member-removed` | Author is admin; only owner can remove owner; not a DM |
| `role-changed` | Author is owner; cannot change own role; not a DM |
| `group-renamed` | Author is admin or owner; not a DM |
| `join-policy-changed` | Author is admin or owner; not a DM |
| `message` | Author is member; DM handshake must be complete |
| `message-edited` | Author is member; DM handshake must be complete |
| `message-deleted` | Author is member; DM handshake must be complete |
| `read-receipt` | Author is member |
| `merge` | Author is member; must reference ≥2 current tips; rate-limited (1/min per author) |

**Admin** = role is `"admin"` or `"owner"`.

### 4.7 Merge Actions

Merge actions compact the DAG by referencing multiple tips as parents, reducing frontier width.

**Trigger conditions** (automatic, after any action):
1. DAG has more than 64 tips
2. At least 60 seconds since this author's last merge
3. Author has at least 2 tips to reference

**Validation**:
- Must reference ≥2 current DAG tips as parents
- Author must be a group member
- Rate-limited: 1 merge per 60 seconds per author (checked via action timestamp)
- Max 4 parents (same as all actions)

**Payload**: Empty — the merge carries no data; its value is in the DAG structure via `parentHashes`.

### 4.8 Owner Invariant

After any member removal or departure, `normalizeOwnerInvariant` runs:

- **0 owners**: Promote earliest-joined member to owner (tiebreak: hex key ascending)
- **2+ owners**: Keep earliest-joined as owner, demote others to admin

### 4.9 DM Handshake

For `dm-created` actions:
- `peerIds` must be a sorted tuple of exactly 2 peer ID strings
- Each peer independently emits a `dm-created` action
- `dmHandshakeComplete = true` when 2+ distinct authors have emitted `dm-created`
- Messages are blocked until handshake is complete

---

## 5. Sync Protocol

### 5.1 Overview

v1.1 uses **frontier-based sync** with three mechanisms:

1. **Heads announce** — Broadcast DAG tips to detect divergence
2. **Sync request/response** — Exchange small batches of envelopes inline via GossipSub
3. **Block fetch** — Stream-based protocol for fetching specific missing actions by hash

### 5.2 Triggers

Sync is event-driven, not timer-based:

1. **`peer:connect`**: Request sync for all joined groups from the new peer
2. **`subscription-change`**: When a known member subscribes to a group topic, publish all stored envelopes for that group to them
3. **Member approval**: When becoming a member of a group, request sync from all connected peers
4. **Heads announce**: When a `heads_announce` message reveals unknown tips, trigger sync

### 5.3 Heads Announce

Peers periodically broadcast their DAG tips to detect divergence.

**Signing**: Ed25519 signature over CBOR-encoded fields: `{type: "heads_announce", groupId, heads, sentAt, senderPeerId, senderPublicKey}`

**Processing on receipt**:
1. Verify signature against `senderPublicKey`
2. Check membership (sender must be a group member, with DM handshake exception)
3. Check for any heads not present in local DAG
4. If missing heads detected → trigger `sync_request` with local `knownHeads`

### 5.4 Sync Request/Response Flow

```
Requester                              Responder
    │                                       │
    │──── sync_request {knownHeads} ──────→│
    │                                       │ compute envelopes not covered
    │←── sync_response {envelopes,          │ by requester's known heads
    │     theirHeads} ────────────────────│ (max 16 envelopes or 64 KiB)
    │                                       │
    │  (if theirHeads reveal more missing)  │
    │──── block fetch stream ─────────────→│
    │←── block fetch response ─────────────│
    │  ... chase missing parents ...        │
```

**Inline limits**: Max 16 envelopes or 64 KiB per sync response.

**After receiving sync response**: If the responder's `theirHeads` or newly-received envelopes reveal missing parent hashes, trigger block fetch chase (Section 5.5).

### 5.5 Block Fetch Protocol

A libp2p stream protocol for fetching specific actions by hash.

**Protocol ID**: `/anypost/blocks/1.0.0/get`

**Request**:
```
{
  protocolVersion: 2,
  type: "getBlocks",
  groupId: UUID,
  hashes: Uint8Array[],          // max 256 hashes per request
  senderPublicKey: Uint8Array,
  signature: Uint8Array,
  sentAt: number
}
```

**Response**:
```
{
  envelopes: SignedActionEnvelope[],  // max 256 envelopes
  missing: Uint8Array[]              // hashes not found (max 256)
}
```

**Authentication**:
- Ed25519 signature over CBOR-encoded fields: `{protocolVersion: 2, type: "getBlocks", groupId, hashes, sentAt}`
- Signer must be a verified group member
- Clock skew tolerance: ±5 minutes

**Block fetch chase**: After receiving block fetch response, scan new envelopes for parent hashes not in local DAG. If found, add them to fetch queue and repeat. Max 100 rounds.

### 5.6 Deduplication

- **DAG level**: `appendAction` returns same state reference if hash already exists
- **GossipSub level**: Built-in message cache prevents re-delivery of recent messages
- **Application level**: `processSignedAction` returns `null` if action already in DAG

### 5.7 Keep-Alive

- Tag group members in libp2p peerStore: `keep-alive-group-member` with value 100
- Ping every 15s; trigger reconnect burst after 2 consecutive failures (schedule: 0, 1s, 2s, 4s, 8s, 15s)
- Fast reconnect (5s) when members are offline; idle check (30s) otherwise

### 5.8 Rate Limits

| Direction | Limit |
|-----------|-------|
| Incoming sync requests | 40 per 10s per peer |
| Outgoing sync requests | 60 per 10s per peer |
| Incoming join requests | 8 per 30s |
| Outgoing join requests | 10 per 30s |
| Outgoing approvals | 10 per 30s |
| Merge actions | 1 per 60s per author |

---

## 6. Relay Infrastructure

### 6.1 Relay Server

- Circuit Relay v2, 128 max reservations
- DHT server mode, provides under `anypost-relay` namespace
- Auto-subscribes to all GossipSub topics its peers use (including `anypost2/group/` topics)
- `canRelayMessage: true` for GossipSub relay
- Forwards all v1.1 wire messages: `heads_announce`, `sync_request`, `sync_response`, `signed_action`

### 6.2 Relay Discovery (Client)

1. DHT lookup: `contentRouting.findProviders(CID("anypost-relay"))`
2. Filter for WebSocket addresses
3. Target pool size: 4 active relays
4. Health check every 30s; evict after 3 consecutive failures
5. Quarantine: 2min base, 30min max (exponential backoff)

---

## 7. Dependencies

Implementations must support:

| Component | Reference Implementation |
|-----------|------------------------|
| libp2p | `libp2p@2.10.0` |
| GossipSub | `@chainsafe/libp2p-gossipsub` |
| DHT | `@libp2p/kad-dht@14.x` |
| Ed25519 signing | `@noble/curves/ed25519` |
| SHA-256 hashing | `@noble/hashes/sha2` |
| CBOR encoding | `cbor-x` |
| CID creation | `multiformats` (CIDv1, raw codec, SHA-256) |
| Circuit Relay | `@libp2p/circuit-relay-v2` |

---

## 8. Compatibility

### 8.1 v1.0 / v1.1 Isolation

v1.0 and v1.1 nodes are **fully isolated**:
- Different topic prefix: `anypost/group/` (v1.0) vs `anypost2/group/` (v1.1)
- `protocolVersion: 2` in all v1.1 wire messages; v1.0 messages without this field are rejected
- Action payloads changed: `targetHash`/`upToHash` (v1.1) vs `targetActionId`/`upToActionId` (v1.0)
- New `merge` action type not recognized by v1.0 nodes

### 8.2 Compatibility Checklist

To be compatible with v1.1 nodes, a new implementation must:

- [ ] Generate Ed25519 account keys (32-byte seed)
- [ ] CBOR-encode SignableAction with `protocolVersion: 2`, sign with Ed25519, hash with SHA-256
- [ ] Verify signatures against exact `signedBytes` (never re-encode)
- [ ] CBOR-encode/decode WireMessages on GossipSub
- [ ] Subscribe to `anypost2/group/{groupId}` topics (note: `anypost2/`, not `anypost/`)
- [ ] Include `protocolVersion: 2` in all group-scoped wire messages
- [ ] Handle all wire message types (at minimum: `signed_action`, `sync_request`, `sync_response`, `heads_announce`, `join_request`)
- [ ] Implement DAG append with idempotent dedup on hash
- [ ] Implement topological sort with timestamp+hash tiebreaker
- [ ] Apply authorization rules per Section 4.6
- [ ] Enforce bounded parents (max 4 per action)
- [ ] Implement smart parent selection (Section 4.4)
- [ ] Support `merge` action type with ≥2 tips requirement and rate limiting
- [ ] Use hash references (`targetHash`, `upToHash`) for message-edited, message-deleted, read-receipt
- [ ] Enforce owner invariant after member removal/departure
- [ ] Enforce DM handshake (2 contributors required before messages)
- [ ] Respond to `heads_announce` by detecting missing heads and triggering sync
- [ ] Respond to `sync_request` with up to 16 envelopes (or 64 KiB)
- [ ] Implement block fetch protocol (`/anypost/blocks/1.0.0/get`) with signed, membership-checked requests
- [ ] Respond to `subscription-change` by publishing stored envelopes
- [ ] Use DHT provider records for group discovery (namespace: `anypost/group/{groupId}`)
- [ ] Participate in pubsub peer discovery on `_peer-discovery._p2p._pubsub` and `anypost/_peer-discovery`

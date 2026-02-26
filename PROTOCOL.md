# Anypost Protocol Specification

> Version: 1.0 — derived from the reference implementation as of 2026-02-26.
> Sufficient to build a compatible node from scratch using any libp2p implementation.

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
Group topic:            anypost/group/{groupId}        (groupId = UUID)
Device discovery topic: anypost/account/{pubKeyHex}/devices
```

### 3.3 Wire Message Types

All messages are a discriminated union on `type`:

#### `signed_action` — Action chain entry

```
{ type: "signed_action", signedBytes: Uint8Array, signature: Uint8Array, hash: Uint8Array }
```

Published on the group topic. This is the primary message type for all group activity (messages, membership changes, etc.). See Section 4.

#### `join_request` — Membership request (via GossipSub)

```
{
  type: "join_request",
  groupId: UUID,
  senderPeerId: string,
  requesterPublicKey: Uint8Array,
  signature: Uint8Array,
  inviteGrant?: InviteGrantProof
}
```

#### `sync_request` — Request missing actions

```
{
  type: "sync_request",
  payload: {
    groupId: UUID,
    senderPeerId: string,
    senderPublicKey: Uint8Array,
    signature: Uint8Array,
    requestId?: UUID,
    targetPeerId?: string,
    knownHash?: Uint8Array     // cursor: "I have everything up to this hash"
  }
}
```

#### `sync_response` — Reply with missing actions

```
{
  type: "sync_response",
  payload: {
    groupId: UUID,
    senderPeerId: string,
    senderPublicKey: Uint8Array,
    signature: Uint8Array,
    requestId?: UUID,
    targetPeerId: string,
    requestKnownHash?: Uint8Array,
    headHash?: Uint8Array,
    nextCursorHash?: Uint8Array,   // pagination: more data after this hash
    envelopes: SignedActionEnvelope[]
  }
}
```

Max 256 envelopes per response. If `nextCursorHash` is present, requester should send another `sync_request` with that as `knownHash`.

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
  id:              UUID,
  groupId:         UUID,
  authorPublicKey: Uint8Array(32),    // Ed25519 public key
  timestamp:       number,            // ms since epoch
  parentHashes:    Uint8Array(32)[],  // references to parent action hashes
  payload:         ActionPayload      // see 4.2
}
```

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

13 variants, discriminated on `type`:

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
| `message-edited` | `targetActionId: UUID`, `newText: string` | Edit previous message |
| `message-deleted` | `targetActionId: UUID` | Delete previous message |
| `read-receipt` | `upToActionId: UUID` | Mark messages as read |

### 4.3 Signing & Verification

#### Create

```
1. Build SignableAction object
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

**Tips**: `getTips(state)` returns hashes of all current leaf actions. New actions should reference all current tips as parents.

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
  readReceipts: Map<hex, UUID>
}

GroupMember = { publicKeyHex, publicKey, role: "owner"|"admin"|"member", joinedAt }
```

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

**Admin** = role is `"admin"` or `"owner"`.

### 4.7 Owner Invariant

After any member removal or departure, `normalizeOwnerInvariant` runs:

- **0 owners**: Promote earliest-joined member to owner (tiebreak: hex key ascending)
- **2+ owners**: Keep earliest-joined as owner, demote others to admin

### 4.8 DM Handshake

For `dm-created` actions:
- `peerIds` must be a sorted tuple of exactly 2 peer ID strings
- Each peer independently emits a `dm-created` action
- `dmHandshakeComplete = true` when 2+ distinct authors have emitted `dm-created`
- Messages are blocked until handshake is complete

---

## 5. Sync Protocol

### 5.1 Triggers

Sync is event-driven, not timer-based:

1. **`peer:connect`**: Request sync for all joined groups from the new peer
2. **`subscription-change`**: When a known member subscribes to a group topic, publish all stored envelopes for that group to them
3. **Member approval**: When becoming a member of a group, request sync from all connected peers
4. **Periodic reconciliation**: Every 20s, check for stale sync peers (>45s since last contact)

### 5.2 Flow

```
Requester                              Responder
    │                                       │
    │──── sync_request {knownHash} ────────→│
    │                                       │ find envelopes after knownHash
    │←── sync_response {envelopes,          │ (up to 256)
    │     nextCursorHash?, headHash} ───────│
    │                                       │
    │  (if nextCursorHash present)          │
    │──── sync_request {knownHash=cursor} ─→│
    │←── sync_response {more envelopes} ────│
    │  ... repeat until complete ...         │
```

### 5.3 Deduplication

- **DAG level**: `appendAction` returns same state reference if hash already exists
- **GossipSub level**: Built-in message cache prevents re-delivery of recent messages
- **Application level**: `processSignedAction` returns `null` if action already in DAG

### 5.4 Keep-Alive

- Tag group members in libp2p peerStore: `keep-alive-group-member` with value 100
- Ping every 15s; disconnect after 2 consecutive failures
- Fast reconnect (5s) when members are offline; idle check (30s) otherwise

### 5.5 Rate Limits

| Direction | Limit |
|-----------|-------|
| Incoming sync requests | 40 per 10s |
| Outgoing sync requests | 60 per 10s |
| Incoming join requests | 8 per 30s |
| Outgoing join requests | 10 per 30s |
| Outgoing approvals | 10 per 30s |

---

## 6. Relay Infrastructure

### 6.1 Relay Server

- Circuit Relay v2, 128 max reservations
- DHT server mode, provides under `anypost-relay` namespace
- Auto-subscribes to all GossipSub topics its peers use
- `canRelayMessage: true` for GossipSub relay

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

## 8. Compatibility Checklist

To be compatible with existing nodes, a new implementation must:

- [ ] Generate Ed25519 account keys (32-byte seed)
- [ ] CBOR-encode SignableAction, sign with Ed25519, hash with SHA-256
- [ ] Verify signatures against exact `signedBytes` (never re-encode)
- [ ] CBOR-encode/decode WireMessages on GossipSub
- [ ] Subscribe to `anypost/group/{groupId}` topics
- [ ] Handle all 11 wire message types (at minimum: `signed_action`, `sync_request`, `sync_response`, `join_request`)
- [ ] Implement DAG append with idempotent dedup on hash
- [ ] Implement topological sort with timestamp+hash tiebreaker
- [ ] Apply authorization rules per Section 4.6
- [ ] Enforce owner invariant after member removal/departure
- [ ] Enforce DM handshake (2 contributors required before messages)
- [ ] Respond to `sync_request` with stored envelopes
- [ ] Respond to `subscription-change` by publishing stored envelopes
- [ ] Use DHT provider records for group discovery (namespace: `anypost/group/{groupId}`)
- [ ] Participate in pubsub peer discovery on `_peer-discovery._p2p._pubsub` and `anypost/_peer-discovery`

# PLAN-0001: Anypost — P2P E2E Encrypted Discord Clone

**Created**: 2026-02-22
**Status**: Ready for implementation

## Summary

Build a browser-only P2P E2E encrypted chat application (like Discord but decentralized) on top of js-libp2p. Uses MLS (RFC 9420) with DMLS extensions for decentralized group encryption, Yjs CRDTs for offline-tolerant message sync, and native WebRTC for voice/video/screenshare. Account identity is a private key. Multi-device support via device certificates. No central server — only lightweight relay/bootstrap nodes for connectivity.

## Requirements

### Core
- P2P browser-only chat with E2E encryption (MLS/DMLS)
- Groups with text/voice channels, direct messages, member management
- Voice/video calls + screen sharing via native WebRTC
- Offline message sync via Yjs CRDTs + IndexedDB
- Account = ed25519 private key (seed phrase / key file / QR import)
- Multi-device: each device has own libp2p PeerId, linked via device certificates
- Settings/profile sync across devices via per-account Yjs doc

### Identity & Onboarding
- First-time: auto-generate key, prompt for display name immediately
- Seed phrase backup deferred but persistent (banner until backed up)
- Display names stored in per-account Yjs settings doc
- Users shown as "DisplayName (..xxxx)" with key suffix for disambiguation

### Group Invitation Protocol
- Invite link format: URL encoding group ID + inviter multiaddress + optional pre-shared secret
- KeyPackage exchange via `/anypost/key-package/1.0.0` libp2p protocol
- Offline invitations: Welcome messages stored in group CRDT, encrypted to invitee's public key
- UX: "Invite" -> shareable link/QR -> recipient opens in browser -> auto-joins

### Connection UX
- Connection state machine visible to UI: disconnected -> connecting-to-relay -> discovering-peers -> connected (relayed) -> connected (direct)
- Persistent connection quality indicator
- "No peers online" state: show cached messages, offline indicator
- Optimistic message sending: show immediately, mark "sending..." until confirmed

## Scope

### In Scope
- Text chat, groups, channels, DMs
- Voice/video calls, screen share
- E2E encryption (MLS with DMLS investigation for decentralized ordering)
- Multi-device support with device certificates
- Offline sync (CRDT)
- Presence/typing indicators
- User profiles with display names
- Onboarding, invitation, connection state UX flows
- Error and empty state design

### Out of Scope
- File sharing/uploads
- Admin moderation tools
- Message search
- Message reactions/threads
- Bots/integrations
- Mobile native apps

## Anti-Goals
- No central server storing messages or metadata
- No user accounts beyond a private key
- No cleartext messages on the wire or at rest
- No server-side logic for group management

## Non-Negotiables
1. All message content must be E2E encrypted — relay nodes must never see plaintext
2. Same account must work simultaneously on multiple devices
3. TDD drives all development — no production code without a failing test (except Phase 0 spike)

## Design

### Architecture

3-workspace monorepo:
- `anypost-core` — all library code in one package with directory-level organization (`src/crypto/`, `src/data/`, `src/protocol/`, `src/media/`, `src/libp2p/`)
- `anypost-web` — SolidJS app
- `anypost-relay` — minimal Node.js relay/bootstrap server

Dependency direction: `shared types` <- `crypto` <- `data` <- `protocol` (integration layer)

### Data Model

**Decrypt-on-receive, store plaintext locally:**
- Messages arrive via GossipSub or CRDT sync
- Decrypt immediately using current MLS epoch key
- Store plaintext in IndexedDB (keyed by message ID)
- CRDT syncs message metadata (sender, timestamp, channel, message ID) + reference to encrypted payload
- Separate storage for encrypted payloads (for offline peers who need to catch up)

**Yjs documents:**
- Group metadata Y.Doc: metadata (Y.Map), channels (Y.Array), members (Y.Map) — stays small
- Per-account settings Y.Doc: display name, avatar, notification prefs, group membership list, device registry
- Message storage: IndexedDB directly for message content, CRDT for ordering/metadata

**MLS epoch key retention:**
- Bounded retention window (configurable, e.g., 30 days or N epochs)
- Keys beyond window deleted (forward secrecy preserved for old messages)
- Explicit tradeoff: offline >30 days = can't decrypt missed messages

### MLS Adaptation (DMLS Investigation)

Investigate DMLS (Distributed MLS) extensions for decentralized commit ordering:
- Per-member "Send Groups" that eliminate single-committer requirement
- DAG-based epoch identifiers for concurrent commit handling
- Puncturable PRFs for init_secret management
- Fallback: pragmatic steward model with failover if DMLS proves infeasible

### Identity Bootstrap
1. Device generates PeerId and device certificate (signed by account key)
2. Device publishes certificate on account-derived GossipSub topic: `anypost.account.<pubkey-hash>.devices`
3. Other devices for same account discover each other via this topic
4. Once connected, devices sync full device registry via per-account Yjs doc

### Browser Transports
- WebRTC: browser-to-browser (primary, requires relay for SDP exchange first)
- WebSocket: browser-to-relay (bootstrap + fallback)
- Circuit Relay v2: SDP signaling + fallback data transport
- STUN servers required for NAT traversal (configure public STUN or deploy own)

### Persistence Hardening
- Call `navigator.storage.persist()` on first launch
- Encrypt MLS state backup under account key, sync in per-account Yjs doc
- "State lost" detection on startup with automatic rejoin workflow
- Warn users that clearing browser data destroys message decryption capability

## Assumptions & Open Questions

### Confirmed Assumptions
- At least 3 public relay/bootstrap nodes for redundancy
- Custom Yjs-over-libp2p sync provider is required (existing library abandoned)
- ts-mls version decided during spike phase
- DMLS feasibility determined during spike/Phase 3
- Video mesh limited to 4 peers (not 8) for bandwidth reasons
- GossipSub sufficient for dev/small networks; DHT/rendezvous needed for production

### Open Questions (Deferred)
- Exact DMLS implementation approach (pending spike investigation)
- TURN-like relay fallback for media streams (if WebRTC hole-punching fails)
- Message archival/compaction strategy for long-lived groups

## Implementation Phases

### Phase 0: Technical Spike (1-2 weeks, throwaway code)
Validate all critical dependencies before writing production code. No TDD requirement.
- Spike A: ts-mls in browser (test both v1.6.1 and v2.0.0-rc.8)
- Spike B: libp2p WebRTC browser-to-browser through relay
- Spike C: Yjs sync over GossipSub
- Spike D: DMLS investigation (research + prototype concurrent commits)
- Spike E: Integration (encrypted message via GossipSub in Yjs doc)
- Go/no-go decision on each dependency

### Phase 1: Foundation (2-3 weeks)
TDD from here forward. 3-workspace monorepo.
- Monorepo scaffolding (pnpm, Turborepo, tsconfig strict, Vitest)
- Shared schemas/types/Result in `anypost-core/src/shared/`
- CBOR codec with Zod validation at decode boundary
- libp2p browser node factory (WebRTC + WS + Relay)
- Relay/bootstrap Node.js server
- GossipSub message routing
- SolidJS skeleton with plaintext chat

**Milestone**: Two browser tabs exchange plaintext messages through a relay.

### Phase 2: Persistence & CRDT (2-3 weeks)
- Yjs document structure (group metadata, member lists, channel lists)
- IndexedDB persistence (y-indexeddb + direct idb for messages)
- Custom Yjs sync provider over libp2p streams
- Offline sync and catch-up

**Milestone**: Messages persist across reloads. Offline peers catch up.

### Phase 3: Identity & E2E Encryption (5-7 weeks)
Split into sub-phases:

**3a: Identity (1-2 weeks)**
- Account key generation (seed phrase -> ed25519)
- Device key generation and device certificates
- User profile with display name (per-account Yjs doc)
- Onboarding flow (auto-generate, prompt display name, defer seed backup)

**3b: E2E Encryption (2-3 weeks)**
- MLS/DMLS group lifecycle (create, add, remove, encrypt, decrypt)
- Commit ordering (DMLS or steward model based on spike findings)
- Encrypted message flow (decrypt-on-receive, store plaintext)
- Epoch key retention with bounded window
- Message buffer for out-of-order epoch key arrival

**3c: Multi-Device (1-2 weeks)**
- Multiple MLS leaf nodes per account
- Device discovery via account-derived GossipSub topic
- Device registry sync
- MLS Add proposals across all groups for new devices

**Milestone**: E2E encrypted messaging. Multi-device works.

### Phase 4: Full Chat UI (3-4 weeks)
- Group management (create, invite, join, leave)
- Group invitation protocol and UX (invite links, KeyPackage exchange)
- Channels (text/voice types)
- Direct messages (2-member MLS groups)
- Presence/typing indicators
- Connection state UI and error handling
- Empty states with actionable prompts
- Settings sync across devices

**Milestone**: Fully functional Discord-like text chat.

### Phase 5: Voice, Video & Screen Sharing (4-6 weeks)
- SDP signaling over libp2p streams
- Native WebRTC media connections
- Voice channels (full mesh, up to 8 peers audio-only)
- Video calls (full mesh, up to 4 peers)
- Screen sharing via getDisplayMedia
- Voice/video UI (controls, grid, speaking indicators)

**Milestone**: Voice/video calls and screen sharing work.

### Phase 6: Hardening (3-4 weeks)
- Steward failover/election (if not using DMLS)
- MLS key rotation for forward secrecy
- Connection resilience (auto-reconnect, relay fallback)
- GossipSub security (peer scoring, opaque topic names, message validation)
- IndexedDB hardening (persist API, MLS state backup)
- Yjs document compaction for long-lived groups
- Relay redundancy (health checking, automatic failover)

**Milestone**: Production-hardened.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript strict mode | Aligns with dev guidelines, browser-native |
| P2P | js-libp2p | Only option for browser P2P with WebRTC |
| Encryption | MLS (RFC 9420) + DMLS investigation | Gold standard for group E2E; DMLS for decentralized ordering |
| MLS library | ts-mls (version decided in spike) | Pure TS, immutable API, browser-native |
| CRDT | Yjs | Proven sync, IndexedDB persistence |
| UI | SolidJS | Fine-grained reactivity, small bundle |
| Wire format | CBOR (cbor-x) | Compact binary, browser-compatible |
| Project structure | 3 workspaces (core, web, relay) | Start simple, extract packages when boundaries proven |
| Message storage | Decrypt-on-receive, store plaintext | Avoids forward secrecy destruction of decrypt-on-read |
| Epoch key retention | Bounded window (30 days) | Balance between offline access and forward secrecy |
| Ed25519 impl | @noble/ed25519 | Already a libp2p dependency, avoids dual crypto libraries |
| Video mesh limit | 4 peers | 8 peers = 17.5 Mbps upload, unrealistic for residential |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ts-mls has critical bugs | M | H | Phase 0 spike validates; abstraction layer enables swap |
| DMLS proves infeasible in TS | M | M | Fallback to pragmatic steward model |
| WebRTC hole-punching fails often | M | M | Circuit relay fallback always available |
| Yjs memory growth in active groups | M | M | Document compaction, message windowing in Phase 6 |
| GossipSub peer discovery unreliable | L | M | DHT/rendezvous on relay nodes in Phase 6 |
| IndexedDB data loss | L | H | navigator.storage.persist(), MLS state backup |
| Custom Yjs provider has bugs | M | H | Extensive sync integration tests in Phase 2 |

## Implementation Notes

- Custom Yjs-over-libp2p provider is ~2-3 weeks of work (no existing production library)
- Use GossipSub for real-time update broadcast, direct libp2p streams for state vector sync (catch-up)
- CBOR decode must always pass through Zod schema before entering application
- Identity bootstrap uses account-derived GossipSub topic for same-account device discovery
- Relay nodes need STUN configuration for WebRTC NAT traversal
- Display names shown as "Name (..xxxx)" for disambiguation (no uniqueness enforcement)
- Consider FloodSub fallback for networks below GossipSub mesh threshold
- GossipSub topics for groups should use opaque hashed names to prevent enumeration

## Acceptance Criteria

- [ ] Phase 0 spike produces go/no-go decisions for ts-mls, libp2p WebRTC, Yjs-over-libp2p, DMLS
- [ ] Two browser peers exchange E2E encrypted text messages through a relay
- [ ] Messages persist in IndexedDB and sync when offline peer reconnects
- [ ] Groups with multiple text channels and member management work
- [ ] Group invitation via shareable link/QR works
- [ ] Same account on two devices both receive and decrypt messages
- [ ] User onboarding with display name and deferred seed backup works
- [ ] Voice/video calls work between 2-4 peers
- [ ] Screen sharing works
- [ ] Non-members cannot decrypt group messages
- [ ] All production code is TDD-driven with full test coverage
- [ ] Connection states, error states, and empty states are handled in the UI

# Anypost

Decentralized peer-to-peer messaging with cryptographic group governance.

## What is Anypost?

Anypost is a P2P group messaging platform that runs entirely in the browser — no central server required. Messages are exchanged directly between peers over [libp2p](https://libp2p.io/), with optional relay nodes for NAT traversal. Every group action (create, join, message, leave) is cryptographically signed and appended to an immutable action chain, giving each group a verifiable, tamper-proof history.

The app supports multi-group chat, direct messages, and an invite system with targeted or open invite tokens. Peers discover each other through a multi-layer system combining DHT provider advertisements, pubsub announcements, and relay pooling. When peers reconnect after going offline, the action chain syncs automatically — no messages are lost.

Anypost runs as a web app (SolidJS), a desktop app (Electron, Linux-first), or an Android app (Capacitor wrapper + native bridge contract). A built-in network observability panel shows relay health, peer topology, and per-group discovery status in real time.

## Features

- **Multi-group chat** — Join multiple groups from a single node, each with isolated message streams
- **Direct messages** — Private 1:1 conversations between peers
- **Signed action chains** — Every group event is Ed25519-signed and forms an append-only DAG with verifiable history
- **Cryptographic identity** — BIP39 seed phrase generates your Ed25519 keypair; no accounts, no servers
- **Multi-layer peer discovery** — DHT providers, pubsub announcements, and relay address harvesting work together
- **NAT traversal** — Circuit relay v2 and WebRTC hole-punching for peers behind firewalls
- **Offline sync** — Reconnecting peers automatically exchange missing action chain entries
- **Invite system** — Targeted (1:1) or open invite tokens with optional expiry and joiner limits
- **Group governance** — Owner/admin roles, manual or auto-join policies, member approval and removal
- **Network observability** — Real-time panel showing relay candidates, peer topology graph, and sync progress
- **Telegram-style UI** — Dark theme, responsive sidebar + chat layout, mobile view switching

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9.15+

### Install and run

```bash
git clone <repo-url>
cd anypost
pnpm install

# Start the web app (with core watch build)
./run web

# Or start both relay and web app together
./run dev
```

Run `./run` with no arguments to see all available commands:

```
./run relay          Build and start the relay node
./run web            Start the web app dev server
./run electron       Start the Electron desktop app (optional profile name)
./run android-sync   Build web assets and sync Capacitor Android project
./run android-open   Open Android Studio for the Android target
./run android-build-apk Build Android debug APK
./run dev            Start both relay and web app
./run build          Build all packages
./run test           Run all tests
./run typecheck      Type-check all packages
```

## Project Structure

```
anypost/
  packages/
    anypost-core/        Protocol, cryptography, state machines, libp2p networking
  apps/
    anypost-web/         SolidJS web frontend (Vite + Tailwind v4)
    anypost-android/     Android wrapper target (Capacitor)
    anypost-relay/       Optional relay server for NAT traversal
    anypost-electron/    Linux-first Electron desktop app
  spikes/                Early prototypes and experiments
```

| Package | Description |
|---------|-------------|
| `anypost-core` | Signed action chains, wire protocol (CBOR + Zod), multi-group state machines, peer discovery, relay health tracking |
| `anypost-web` | Telegram-style chat UI, onboarding flow, network observability panel, QR invite scanning |
| `anypost-android` | Android wrapper + bridge contract for deep links/notifications/native runtime hooks |
| `anypost-relay` | libp2p relay node with circuit relay v2, DHT server mode, WebSocket + TCP listeners |
| `anypost-electron` | Desktop wrapper with embedded relay, multi-profile support, native transport runtime |

## Architecture Overview

Anypost is built on **libp2p** for all peer-to-peer communication. Messages are broadcast via **GossipSub** (publish/subscribe), with each group mapped to its own topic. Peers discover each other through four layers: auto-harvesting relay addresses, pubsub peer announcements, group-specific DHT provider advertisements, and direct peer ID sharing.

Every significant group event is modeled as a **signed action** — a CBOR-encoded payload signed with the author's Ed25519 key and hashed with SHA-256. Actions form a directed acyclic graph (DAG) that can be replayed to derive the current group state: members, roles, join policy, and message history. This design enables offline-safe sync, conflict-free merging, and a tamper-proof audit trail without any central authority.

The core library uses **pure state machines** — all state transitions are immutable functions that take a state and return a new state. This makes the protocol logic easy to test, reason about, and compose with side-effecting layers like libp2p event handlers and browser storage.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode) |
| P2P networking | libp2p (GossipSub, Kademlia DHT, circuit relay v2, WebRTC, WebSockets) |
| Cryptography | Ed25519 (`@noble/curves`), SHA-256 (`@noble/hashes`), BIP39 (`@scure/bip39`) |
| Serialization | CBOR (`cbor-x`), Zod schemas at trust boundaries |
| Frontend | SolidJS, Tailwind CSS v4, D3.js (topology graph) |
| Desktop | Electron 32 |
| Mobile | Capacitor 7 (Android target) |
| Build | pnpm workspaces, Turborepo, Vite |
| Testing | Vitest, Playwright (integration) |

## Development

The `./run` script is the main entry point for all development tasks. It handles building dependencies in the right order.

```bash
# Build all packages
./run build

# Run all tests
./run test

# Type-check all packages
./run typecheck

# Start Electron with a named profile (useful for multi-instance testing)
./run electron alice
```

The web app dev server watches `anypost-core` for changes and rebuilds automatically.

## Testing

Tests use **Vitest** and follow a behavior-driven approach — testing through public APIs, not implementation details. Test files are colocated with their source files.

```bash
# Run all tests
./run test

# Run tests for a specific package
pnpm --filter anypost-core test

# Integration tests (headless browser, requires Playwright)
pnpm --filter anypost-web run e2e:dm-no-relay-ipfs
pnpm --filter anypost-web run e2e:soak -- --iterations 10
```

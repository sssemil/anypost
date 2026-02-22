# Spike A: ts-mls Browser Validation — Findings

**Date**: 2026-02-22
**Versions tested**: v1.6.1 (stable), v2.0.0-rc.8 (release candidate)
**Verdict**: GO — use v2.0.0-rc.8

## Summary

Both versions of ts-mls successfully run in a browser environment. The core MLS lifecycle (group creation, member add/remove, encrypt/decrypt, KeyPackage generation, Welcome handling) works correctly in both versions. v2.0.0-rc.8 is the clear choice due to a cleaner API, a critical bug fix in state serialization, and better TypeScript ergonomics.

## Test Results

### v2.0.0-rc.8 (RECOMMENDED)

| Test | Result |
|------|--------|
| Ciphersuite initialization | PASS |
| KeyPackage generation (3 members) | PASS |
| Group creation | PASS |
| Add member (2-member group) | PASS |
| Add member (3-member group) | PASS |
| Encrypt/decrypt round-trip (all members) | PASS |
| Bidirectional messaging | PASS |
| Remove member | PASS |
| Forward secrecy (removed member can't decrypt) | PASS |
| State serialization round-trip | PASS |
| Performance (100 cycles) | PASS — avg 0.54ms encrypt, 0.55ms decrypt |

### v1.6.1 (NOT RECOMMENDED)

| Test | Result |
|------|--------|
| Ciphersuite initialization | PASS |
| KeyPackage generation (3 members) | PASS |
| Group creation | PASS |
| Add member (2-member group) | PASS |
| Add member (3-member group) | PASS |
| Encrypt/decrypt round-trip (all members) | PASS |
| Remove member | PASS |
| Forward secrecy | PASS |
| State serialization round-trip | **FAIL** — deserialization crashes after member removal |
| Performance (100 cycles) | PASS — avg 0.50ms encrypt, 0.51ms decrypt |

## Performance

Both versions are well within the 10ms target for real-time chat:

| Metric | v1.6.1 | v2.0.0-rc.8 |
|--------|--------|-------------|
| Encrypt avg | 0.50ms | 0.54ms |
| Encrypt p95 | 0.67ms | 0.76ms |
| Decrypt avg | 0.51ms | 0.55ms |
| Decrypt p95 | 0.70ms | 0.80ms |

Performance is essentially identical. Both are ~18x faster than the 10ms target.

## Bundle Size (v2.0.0-rc.8)

| Chunk | Size | Gzipped |
|-------|------|---------|
| ts-mls core | 131.16 KB | 35.92 KB |
| ed25519 (crypto) | 6.37 KB | 3.04 KB |
| montgomery (x25519) | 8.81 KB | 3.84 KB |
| App code | 8.67 KB | 2.97 KB |
| **Total relevant** | **~155 KB** | **~46 KB** |

Bundle size is very reasonable for a complete MLS implementation. The unused ciphersuite chunks (ed448, nist, chacha, etc.) are lazy-loaded and won't be fetched unless needed.

## Critical Bug in v1.6.1

**State deserialization fails after member removal:**

```
InternalError: The last node in the ratchet tree must be non-blank.
```

This occurs when decoding a `GroupState` that was serialized after removing a member (leaving a blank trailing node in the ratchet tree). This is a **blocking bug** for any application that needs to persist MLS state (which we do — IndexedDB persistence is a core requirement).

This bug is fixed in v2.0.0-rc.8, where `encode(clientStateEncoder, state)` / `decode(clientStateDecoder, bytes)` correctly handles blank trailing nodes.

## API Comparison

### v1.6.1 (positional parameters, string types)

```typescript
// Credentials use string literals
const cred = { credentialType: "basic", identity: bytes };

// Ciphersuite requires two-step init
const cs = getCiphersuiteFromName("MLS_128_...");
const impl = await getCiphersuiteImpl(cs);

// Functions use positional parameters
const state = await createGroup(groupId, keyPkg, privKey, extensions, impl);
const result = await createCommit({ state, cipherSuite: impl, pskIndex }, opts);
const joined = await joinGroup(welcome, keyPkg, privKey, pskIndex, impl);
const msg = await createApplicationMessage(state, bytes, impl);

// processMessage takes positional args
const result = await processMessage(mlsMsg, state, pskIndex, acceptAll, impl);

// Application message returns privateMessage (not MlsFramedMessage)
// Must manually wrap for processMessage
const wrapped = { version: "mls10", wireformat: "mls_private_message", privateMessage: result.privateMessage };
```

### v2.0.0-rc.8 (params objects, typed constants)

```typescript
// Credentials use typed constants
const cred = { credentialType: defaultCredentialTypes.basic, identity: bytes };

// Ciphersuite is single-step
const impl = await getCiphersuiteImpl("MLS_128_...");

// Context object shared across calls
const context = { cipherSuite: impl, authService: unsafeTestingAuthenticationService };

// Functions use params objects
const state = await createGroup({ context, groupId, keyPackage, privateKeyPackage });
const result = await createCommit({ context, state, extraProposals: [...] });
const joined = await joinGroup({ context, welcome, keyPackage, privateKeys });
const msg = await createApplicationMessage({ context, state, message: bytes });

// processMessage takes params object, returns MlsFramedMessage
const result = await processMessage({ context, state, message: mlsFramedMsg });
```

### Key API Differences

| Feature | v1.6.1 | v2.0.0-rc.8 |
|---------|--------|-------------|
| Parameters | Positional | Object/params |
| Proposal types | String (`"add"`) | Constant (`defaultProposalTypes.add`) |
| Credential types | String (`"basic"`) | Constant (`defaultCredentialTypes.basic`) |
| Auth service | `defaultAuthenticationService` | `unsafeTestingAuthenticationService` |
| Ciphersuite init | Two steps | One step |
| Context | Per-call params | Shared `MlsContext` |
| State encoding | `encodeGroupState`/`decodeGroupState` | `encode(clientStateEncoder)`/`decode(clientStateDecoder)` |
| `getGroupMembers` | Not exported | Exported |
| App message result | `{ privateMessage }` | `{ message: MlsFramedMessage }` |

## Browser Compatibility

- **No Node.js-only dependencies**: ts-mls is pure TypeScript, no `fs`, `path`, `child_process`, etc.
- **Web Crypto API**: `@hpke/core` (ts-mls dependency) uses Node.js `crypto` module but Vite correctly externalizes it for browsers, falling back to Web Crypto API (`crypto.subtle`)
- **No polyfills needed**: The library works directly with `crypto.subtle` in modern browsers
- **Required peer dependencies**: `@noble/hashes` and `@noble/curves` must be installed for X25519/Ed25519 ciphersuites

## Workarounds Identified

1. **Peer dependencies not declared**: ts-mls doesn't declare `@noble/hashes` and `@noble/curves` as peer dependencies, but they're required for most ciphersuites. Must install explicitly.
2. **Vite externalization warning**: `@hpke/common` imports Node.js `crypto` — Vite externalizes this with a warning. Harmless but noisy. Can suppress with Vite config if desired.
3. **No browser-specific export map**: ts-mls doesn't have a `"browser"` field in package.json. Works fine with bundlers (Vite, Webpack) but not with direct `<script type="module">` imports.

## Recommendation

**GO with v2.0.0-rc.8.**

Rationale:
1. **Critical bug in v1.6.1**: State deserialization fails after member removal — blocks IndexedDB persistence
2. **Better API ergonomics**: Params objects, typed constants, shared context — reduces boilerplate and prevents errors
3. **Better TypeScript support**: `getGroupMembers` exported, proper typed constants, cleaner discriminated unions
4. **Performance equivalent**: Both versions within 1ms of each other
5. **Same bundle size**: Identical dependency tree
6. **Active development**: RC track means bugs get fixed; v1.x is likely frozen

Risk of using an RC:
- API may change before final 2.0.0 release
- Mitigation: wrap ts-mls behind an abstraction layer (planned in architecture)
- The library has 37 test scenarios and RFC compliance test vectors — quality is high

## Ciphersuite Recommendation

Use `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (ciphersuite 1):
- X25519 for key exchange — fast, well-studied, small keys
- AES-128-GCM for encryption — hardware-accelerated on most CPUs
- SHA-256 for hashing — ubiquitous
- Ed25519 for signatures — already used by libp2p for PeerId
- Post-quantum options available as upgrade path (ML-KEM, X-Wing)

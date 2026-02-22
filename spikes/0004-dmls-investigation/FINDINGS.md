# Spike 0004: DMLS Investigation

**Date**: 2026-02-22
**Status**: Research complete

## Summary

Investigated two competing "DMLS" approaches for decentralized MLS commit ordering:
1. **Decentralized MLS** (draft-kohbrok-mls-dmls-03): DAG epochs + PPRFs — research-grade, requires ts-mls fork
2. **Distributed MLS** (draft-xue-distributed-mls): Per-member Send Groups — simpler, but O(n) storage

**Verdict: DEFER DMLS. Use steward model for v1 with automatic steward failover.**

---

## Two Protocols Called "DMLS"

### Decentralized MLS (draft-kohbrok, phnx.im)

Replaces MLS's linear epoch counter with a DAG. Multiple members can commit concurrently from the same epoch, creating fork branches. Uses Puncturable PRFs (PPRFs) to maintain Forward Secrecy while retaining old state for out-of-order commit processing.

**Key mechanism**: Each commit produces a child epoch in the DAG. Fork resolution is left to the application layer. PPRF (~8KB per evaluation) allows derivation of fork-specific init_secrets while puncturing (deleting) used paths.

**Status**: IETF Individual Draft (not WG adopted), expires April 2026. First PoC in Rust (OpenMLS fork) published October 2025 by the spec authors. No TypeScript implementation exists.

### Distributed MLS (draft-xue, Germ Network)

Each member owns a personal "Send Group" — a standard MLS group where only they commit. Other members join as receive-only. Eliminates concurrent commits by construction (only one committer per Send Group).

**Key mechanism**: N parallel MLS groups for N members. Cross-group key material sharing via PSK imports. O(n) storage per member, O(n²) total.

**Status**: Individual Draft. Germ Network's PairMLS uses this approach for 1:1 conversations on Bluesky (production).

---

## ts-mls API Analysis

ts-mls v2.0.0-rc.8 exposes:
- **Full KeySchedule** including `initSecret`, `exporterSecret`, all epoch secrets
- **SecretTree** with intermediate nodes and leaf nodes
- **RatchetTree** with full tree structure inspection
- **Immutable ClientState** — can maintain multiple concurrent states
- **Serialization** — encode/decode entire ClientState for storage
- **KDF primitives** via CiphersuiteImpl

### Can ts-mls support DMLS?

| What DMLS needs | ts-mls provides? | Notes |
|-----------------|-------------------|-------|
| Access to init_secret | YES | Directly in KeySchedule |
| Multiple concurrent states | YES | ClientState is immutable |
| Custom key schedule (PPRF) | NO | Key derivation is internal |
| DAG epoch identifiers | NO | Uses integer epochs internally |
| Multi-epoch storage | PARTIAL | Storage API assumes one epoch per group |
| External PSK proposals | UNKNOWN | Not confirmed in exports |

**Verdict**: Full draft-kohbrok DMLS requires forking ts-mls (key schedule changes). Draft-xue Send Groups could work on top of ts-mls's standard API, but with O(n) overhead.

---

## Steward Model vs DMLS

### Steward Model (v1 plan)

| Aspect | Assessment |
|--------|-----------|
| ts-mls compatible | YES — no protocol modifications |
| Implementation complexity | LOW |
| Security (FS/PCS) | FULL — standard MLS guarantees preserved |
| Offline resilience | POOR — steward offline blocks membership changes |
| Censorship resistance | POOR — steward can ignore proposals |

**Key weakness**: Steward offline = no add/remove/key-rotation. Chat messages (symmetric) still work.

**Mitigation**: Automatic steward failover via deterministic election:
- All members share MLS group state → agree on member ordering
- If steward doesn't commit within timeout T, next-indexed member becomes steward
- Reference: Cloudflare's formally-verified Designated Committer (TLA+ model checked)
- Emergency escalation: after longer timeout T2, any member can commit

### Full DMLS (draft-kohbrok)

| Aspect | Assessment |
|--------|-----------|
| ts-mls compatible | NO — requires fork |
| Implementation complexity | VERY HIGH — PPRF, DAG, fork resolution |
| Security (FS/PCS) | WEAKENED under forks (acknowledged in spec) |
| Offline resilience | EXCELLENT — any member can commit |
| Maturity | Research PoC only (Rust, Oct 2025) |

**Deal-breakers for v1**:
1. No TypeScript implementation exists in any form
2. Requires forking ts-mls at the key schedule level
3. The spec (Individual Draft) may change significantly before adoption
4. Fork resolution requires a separate consensus mechanism anyway

### Multi-Steward (de-MLS / VAC approach)

A middle ground: k-of-n stewards coordinate commits via voting.

| Aspect | Assessment |
|--------|-----------|
| ts-mls compatible | YES — standard MLS + app-layer voting |
| Implementation complexity | MEDIUM |
| Offline resilience | GOOD — k-of-n redundancy |
| Maturity | Research PoC (Rust, Waku transport) |

Could be a v2 enhancement if single-steward proves insufficient.

---

## Recommendation

### For v1: Steward Model with Automatic Failover

1. **Single steward** (group creator initially) serializes all commits
2. **Deterministic election**: On steward offline (no commit within timeout), member with lowest leaf index in the MLS tree becomes steward. All members agree because they share group state.
3. **Emergency escalation**: After longer timeout, any online member can commit. Concurrent commits resolved by "first seen wins" — losing branch's proposals are re-submitted.
4. **Steward transfer**: Explicit proposal to hand off steward role (e.g., before going offline)

This approach:
- Uses ts-mls as-is (no fork)
- Preserves full Forward Secrecy and Post-Compromise Security
- Handles steward offline gracefully
- Is simple enough to implement correctly and audit
- Has precedent: Cloudflare's Orange Meets uses the same pattern (formally verified)

### For v2+: Consider Multi-Steward or DMLS

- If single-steward proves to be a UX problem → multi-steward (k-of-n voting)
- If the DMLS spec stabilizes and a TypeScript library emerges → evaluate full DMLS
- Monitor: draft-kohbrok WG adoption status, ts-mls extension points

---

## Key References

| Resource | URL |
|----------|-----|
| draft-kohbrok-mls-dmls-03 | https://datatracker.ietf.org/doc/draft-kohbrok-mls-dmls/ |
| DMLS living spec | https://phnx-im.github.io/dmls-spec/draft-kohbrok-mls-dmls.html |
| draft-xue-distributed-mls | https://germ-mark.github.io/distributed-mls-id/draft-xue-distributed-mls.html |
| DMLS vs DMLS (FOSDEM 2026) | https://www.uhoreg.ca/documents/fosdem-2026/__/dmls_vs_dmls.html |
| phnx.im DMLS blog post | https://blog.phnx.im/making-mls-more-decentralized/ |
| Fork-Resilient CGKA (FREEK) | https://eprint.iacr.org/2023/394.pdf |
| OpenMLS DMLS PoC | https://gitlab.matrix.org/uhoreg/openmls/-/tree/dmls |
| de-MLS (VAC Research) | https://github.com/vacp2p/de-mls |
| Cloudflare Designated Committer | https://blog.cloudflare.com/orange-me2eets-we-made-an-end-to-end-encrypted-video-calling-app-and-it-was/ |
| Cloudflare TLA+ model | https://github.com/cloudflareresearch/orange-e2ee-model-check |
| marmot-ts (ts-mls wrapper ref) | https://github.com/parres-hq/marmot-ts |
| Keyhive (Ink & Switch) | https://www.inkandswitch.com/keyhive/notebook/02/ |

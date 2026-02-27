# Block Fetch Stream Protocol

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 3 — Block Fetch Stream Protocol

## Description

Implement the `/anypost/blocks/1.0.0/get` libp2p stream protocol for direct peer-to-peer bulk history transfer. This is the first custom stream protocol in the codebase.

### New module: `packages/anypost-core/src/protocol/block-fetch.ts`

**Protocol constant**:
```
BLOCK_FETCH_PROTOCOL = "/anypost/blocks/1.0.0/get"
```

**Request schema** (CBOR encoded):
```typescript
BlockFetchRequestSchema = z.object({
  protocolVersion: z.literal(2),
  type: z.literal("getBlocks"),
  groupId: GroupIdSchema,
  hashes: z.array(Uint8ArraySchema).max(256),
  senderPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
  sentAt: z.number(),
})
```

**Signing payload**: `CBOR({ protocolVersion: 2, type: "getBlocks", groupId, hashes, sentAt })`

**Response schema** (CBOR encoded):
```typescript
BlockFetchResponseSchema = z.object({
  envelopes: z.array(SignedActionEnvelopeWireSchema).max(256),
  missing: z.array(Uint8ArraySchema),
})
```

**Handler function** (`handleBlockFetchRequest`):
1. Read length-prefixed CBOR request from stream
2. Validate against `BlockFetchRequestSchema`
3. Verify signature against `senderPublicKey` over signing payload bytes
4. Reject if `sentAt > Date.now() + 5 * 60 * 1000` (5 min clock skew)
5. Look up group — derive state, check `senderPublicKey` is a member
6. Collect requested envelopes from local DAG (by hash lookup)
7. Cap response at 256 envelopes AND 1 MiB total serialized size
8. Put unfound/unfitting hashes in `missing` array
9. Write length-prefixed CBOR response to stream
10. Close stream

**Requester function** (`fetchBlocks`):
1. `libp2p.dialProtocol(peerId, BLOCK_FETCH_PROTOCOL)`
2. Write length-prefixed CBOR request (signed)
3. Read length-prefixed CBOR response
4. Validate against `BlockFetchResponseSchema`
5. Return `{ envelopes, missing }`
6. Close stream
7. Timeout after 30s

### Stream framing

Use `it-length-prefixed` (already a transitive libp2p dependency) for message framing:
- Encode: `lp.encode()` wraps CBOR bytes with varint length prefix
- Decode: `lp.decode()` reads length-prefixed message from stream

### Registration

Register handler on libp2p node startup:
```typescript
libp2p.handle(BLOCK_FETCH_PROTOCOL, handleBlockFetchRequest)
```

## Acceptance Criteria

- [x] Handler validates request schema and rejects malformed requests
- [x] Handler verifies signature and rejects invalid signatures
- [x] Handler rejects requests with `sentAt` too far in future (>5 min)
- [x] Handler checks group membership and rejects non-members
- [x] Handler returns requested envelopes (by hash lookup) and reports missing hashes
- [x] Handler caps response at 256 envelopes and 1 MiB
- [x] Requester sends signed request and receives parsed response
- [x] Requester handles timeout (30s)
- [x] Stream is properly closed after request/response exchange
- [x] Length-prefixed CBOR framing works correctly
- [x] All schemas validated with Zod
- [x] Pure functions tested independently; integration tested with libp2p mock or real node

## Implementation Notes

- This is the first custom stream protocol in the codebase. Use it as a reference pattern for future protocols.
- `it-length-prefixed` API: `pipe(stream.source, lp.decode(), async function*(source) { ... })` for reading; `pipe([encodedMessage], lp.encode(), stream.sink)` for writing.
- The handler needs access to: (1) group DAG state for envelope lookup, (2) derived group state for membership check. These should be injected via a callback or context object, following the dependency injection pattern used elsewhere.
- For the 1 MiB cap: track cumulative CBOR-encoded envelope size as you collect envelopes. Stop when limit reached, put remaining hashes in `missing`.
- Export `BLOCK_FETCH_PROTOCOL`, `BlockFetchRequest`, `BlockFetchResponse` types, `handleBlockFetchRequest`, `fetchBlocks` from barrel.

## Dependencies

- Blocked by: 0048 (schemas), 0049 (processBulkSignedActions for the caller)
- Blocks: 0051 (frontier sync uses block fetch for recursive parent chase)

## History

- 2026-02-26 Created from brutal-plan PLAN-0002
- 2026-02-27 00:18 Started work on this task
- 2026-02-27 01:10 Implementation complete (TDD: 22 tests, all green)
- 2026-02-27 01:40 Self-review #1: 0 CRITICAL, 4 MAJOR, 3 MINOR, 0 NIT
- 2026-02-27 02:00 Fixed all 4 MAJOR findings (+5 new tests, 27 total)
- 2026-02-27 02:15 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

# CBOR Codec with Zod Validation

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement CBOR encode/decode codec in `anypost-core/src/protocol/codec.ts` using cbor-x. All decoded messages must pass through Zod schema validation before entering the application. TDD required.

## Acceptance Criteria

- [x] `encodeWireMessage` produces a `Uint8Array` from a typed message
- [x] `decodeWireMessage` reconstructs the original typed message from bytes
- [x] Round-trip encode/decode preserves data for every `WireMessageType`
- [x] Malformed input returns error `Result` (not throws)
- [x] `Uint8Array` payloads (encrypted message content) handled correctly
- [x] Zod validation applied at decode boundary
- [x] All tests pass via TDD

## Implementation Notes

- Follow TDD strictly — write failing tests first:
  - "encodeWireMessage should produce a Uint8Array"
  - "decodeWireMessage should reconstruct the original message"
  - "encode/decode should round-trip for every WireMessageType"
  - "decodeWireMessage should return error Result for malformed input"
  - "codec should handle messages with Uint8Array payloads"
- Use `cbor-x` for CBOR encoding/decoding
- Decode flow: bytes → CBOR decode → Zod parse → typed message
- Return `Result<WireMessage, CodecError>` from decode (never throw)
- Depends on schemas from task 0008

## Dependencies

- Blocked by: 0008
- Blocks: 0012

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 08:36 Started work on this task
- 2026-02-22 08:38 Task completed. CBOR codec with Zod validation, 8 tests, 21 lines. Final review passed with 0 CRITICAL, 0 MAJOR findings.

# CBOR Codec with Zod Validation

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement CBOR encode/decode codec in `anypost-core/src/protocol/codec.ts` using cbor-x. All decoded messages must pass through Zod schema validation before entering the application. TDD required.

## Acceptance Criteria

- [ ] `encodeWireMessage` produces a `Uint8Array` from a typed message
- [ ] `decodeWireMessage` reconstructs the original typed message from bytes
- [ ] Round-trip encode/decode preserves data for every `WireMessageType`
- [ ] Malformed input returns error `Result` (not throws)
- [ ] `Uint8Array` payloads (encrypted message content) handled correctly
- [ ] Zod validation applied at decode boundary
- [ ] All tests pass via TDD

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

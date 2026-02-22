# Shared Schemas, Types, and Result Type

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Implement the shared schemas, types, and Result type in `anypost-core/src/shared/`. These are the foundational types used across all other modules. TDD required.

Key items:
- `Result<T, E>` type (success/failure discriminated union)
- Zod schemas for: PeerId, GroupId, ChannelId, MessageId, AccountPublicKey
- `EncryptedMessageSchema` — encrypted message wire format
- `MessageContentSchema` — plaintext message content
- `WireMessageSchema` — discriminated union of all wire message types
- Factory functions for test data

## Acceptance Criteria

- [x] `Result<T, E>` type with `success` and `failure` constructors
- [x] All Zod schemas validate correct inputs and reject invalid inputs
- [x] Types derived from schemas (no manual type definitions for schema-backed data)
- [x] Factory functions for all schemas (test data generation)
- [x] All tests pass via TDD (RED-GREEN-REFACTOR)
- [x] Schemas exported from `anypost-core/src/shared/index.ts`

## Implementation Notes

- Follow TDD strictly — write failing tests first for each schema
- Tests from the plan:
  - "Result.success should carry data"
  - "Result.failure should carry error"
  - "PeerIdSchema should accept valid peer ID strings"
  - "PeerIdSchema should reject empty strings"
  - "GroupIdSchema should accept valid UUIDs"
  - "EncryptedMessageSchema should validate complete message objects"
  - "EncryptedMessageSchema should reject messages with missing fields"
  - "MessageContentSchema should accept text-only messages"
  - "WireMessageSchema should validate all message types"
- Use Zod for all schemas, derive types with `z.infer<typeof Schema>`
- Factory functions should use `Partial<T>` overrides pattern per CLAUDE.md

## Dependencies

- Blocked by: 0007
- Blocks: 0009, 0012

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 08:25 Started work on this task
- 2026-02-22 08:29 Implementation complete, starting code reduction
- 2026-02-22 08:30 Code reduction complete, starting self-review
- 2026-02-22 08:32 Self-review #1: 1 CRITICAL, 1 MAJOR, 2 MINOR, 0 NIT
- 2026-02-22 08:35 Fixed: schema validation in factories, removed type assertion, deterministic timestamp, removed ResultType alias
- 2026-02-22 08:36 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

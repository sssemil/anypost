# Self-Review #1

**Date**: 2026-02-22T08:32:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 1
- MINOR: 2
- NIT: 0

## Findings

### [CRITICAL] 1: `as WireMessage` type assertion violates project rules
**File**: `packages/anypost-core/src/shared/factories.ts:35`
**Confidence**: 95

**Issue**:
The `as WireMessage` type assertion directly violates the project convention: "No type assertions (`as SomeType`) unless absolutely necessary with clear justification." It silences TypeScript's discriminated union checking, allowing mismatched type/payload combinations to compile without error.

**Code**:
```typescript
export const createWireMessage = (
  overrides?: Partial<WireMessage>,
): WireMessage => ({
  type: "encrypted_message",
  payload: createEncryptedMessage(),
  ...overrides,
} as WireMessage);
```

**Fix**:
Validate factory output through the schema, eliminating both the type assertion and the type-safety gap:
```typescript
export const createWireMessage = (
  overrides?: Partial<WireMessage>,
): WireMessage =>
  WireMessageSchema.parse({
    type: "encrypted_message",
    payload: createEncryptedMessage(),
    ...overrides,
  });
```

---

### [MAJOR] 2: Factory functions skip schema validation (convention violation)
**File**: `packages/anypost-core/src/shared/factories.ts:8-27`
**Confidence**: 90

**Issue**:
Project conventions explicitly state factory functions should validate output against real schemas: "Validate against real schema to catch type mismatches." The factories currently return raw spread objects without validation. A caller could pass invalid overrides (e.g., `{ text: "" }` for MessageContent) and the factory would silently return invalid data.

**Code**:
```typescript
export const createEncryptedMessage = (
  overrides?: Partial<EncryptedMessage>,
): EncryptedMessage => ({
  id: DEFAULT_MESSAGE_ID,
  ...overrides,
});
```

**Fix**:
Import schemas and parse factory output:
```typescript
export const createEncryptedMessage = (
  overrides?: Partial<EncryptedMessage>,
): EncryptedMessage =>
  EncryptedMessageSchema.parse({
    id: DEFAULT_MESSAGE_ID,
    ...defaults,
    ...overrides,
  });
```

---

### [MINOR] 3: Non-deterministic `Date.now()` in factory default
**File**: `packages/anypost-core/src/shared/factories.ts:17`
**Confidence**: 80

**Issue**:
`Date.now()` produces a different value each invocation, making factory output non-deterministic. Tests comparing factory-produced messages for equality or using snapshots will be unreliable.

**Fix**:
Use a fixed default: `const DEFAULT_TIMESTAMP = 1700000000000;`

---

### [MINOR] 4: Redundant `ResultType` alias
**File**: `packages/anypost-core/src/shared/index.ts:2`
**Confidence**: 70

**Issue**:
`Result` is already usable in both value and type positions due to TypeScript's dual namespace resolution. The `ResultType` alias adds API surface without adding value.

**Fix**:
Remove: `export type { Result as ResultType } from "./result.js";`

---

## Verdict
NEEDS_FIXES

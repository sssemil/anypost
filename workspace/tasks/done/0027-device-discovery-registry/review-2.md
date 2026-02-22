# Self-Review #2

**Date**: 2026-02-22T12:40:00Z
**Iteration**: 2 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 0
- NIT: 0

## Findings

### [MAJOR] 1: `RegisteredDevice` type manually defined instead of derived from schema
**File**: `packages/anypost-core/src/data/device-registry.ts:14-20`
**Confidence**: 88

**Issue**:
The `RegisteredDeviceSchema` (lines 6-12) and `RegisteredDevice` type (lines 14-20) are independently defined. The project convention (CLAUDE.md: "Always define your schemas first, then derive types from them") and codebase pattern (every type in `schemas.ts` uses `z.infer<typeof Schema>`) require deriving types from schemas. Having both creates a drift risk where the schema and type could silently diverge.

**Code**:
```typescript
const RegisteredDeviceSchema = z.object({
  devicePeerId: z.string().min(1),
  accountPublicKey: z.instanceof(Uint8Array),
  timestamp: z.number(),
  signature: z.instanceof(Uint8Array),
  lastSeen: z.number(),
});

export type RegisteredDevice = {
  readonly devicePeerId: string;
  readonly accountPublicKey: Uint8Array;
  readonly timestamp: number;
  readonly signature: Uint8Array;
  readonly lastSeen: number;
};
```

**Fix**:
Replace the manual type with `Readonly<z.infer<typeof RegisteredDeviceSchema>>`.

---

### [MAJOR] 2: No tests for defensive parsing of corrupt/malformed CRDT data
**File**: `packages/anypost-core/src/data/device-registry.test.ts`
**Confidence**: 82

**Issue**:
`getRegisteredDevices` has two defensive paths: (1) filtering non-Y.Map entries, and (2) `safeParse` validation that drops invalid entries. Neither is tested. All 13 existing tests only insert well-formed data, so these defensive guards are effectively untested dead code. If someone removed the `safeParse` validation, all tests would still pass.

**Fix**:
Add tests that directly manipulate the Y.Doc to insert malformed data, verifying that `getRegisteredDevices` gracefully excludes it.

---

## Dismissed Findings

### Cert verification before registry insertion (3/4 subagents, conf 82-92)
**Dismissed**: This is a data layer module. Existing data modules (`addMember`, `setGroupMetadata`, `appendMessage`) store what callers provide without verifying. Certificate verification belongs in the protocol/integration layer. The integration layer (future task) will call `verifyDeviceCertificate` before `addDeviceToRegistry`.

### Unbounded device registry growth (1/4 subagents, conf 80)
**Dismissed**: Expected device count is < 10. Adding a limit is premature for v1. Can be added when hardening.

### `deviceDiscoveryTopic` input validation (1/4 subagents, conf 82)
**Dismissed**: Internal function. Caller always provides output from `bytesToHex()`. Same pattern as `groupTopic` which accepts raw `GroupId` string.

## Verdict
NEEDS_FIXES

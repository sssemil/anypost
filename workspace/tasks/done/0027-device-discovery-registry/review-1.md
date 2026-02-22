# Self-Review #1

**Date**: 2026-02-22T12:33:44Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 2
- MINOR: 2
- NIT: 1

## Findings

### [CRITICAL] 1: `getRegisteredDevices` uses `as` type assertions bypassing validation at CRDT trust boundary
**File**: `packages/anypost-core/src/data/device-registry.ts:59-63`
**Confidence**: 92

**Issue**:
Five `as` type assertions cast Y.Map values without runtime validation. Data from a Yjs document is a trust boundary (synced from remote peers via CRDT). The established codebase pattern (`settings-document.ts:getDisplayName`, `group-document.ts:getGroupMetadata`) uses `safeParse` against Zod schemas at read boundaries. This function deviates from that pattern and violates the project's "no type assertions" rule.

Additionally, the function builds the result array using mutable `push`, violating the immutability conventions.

**Code**:
```typescript
devicesMap.forEach((value) => {
  if (!(value instanceof Y.Map)) return;
  devices.push({
    devicePeerId: value.get("devicePeerId") as string,
    accountPublicKey: value.get("accountPublicKey") as Uint8Array,
    timestamp: value.get("timestamp") as number,
    signature: value.get("signature") as Uint8Array,
    lastSeen: value.get("lastSeen") as number,
  });
});
```

**Fix**:
Create a local `RegisteredDeviceSchema` and validate extracted Y.Map data against it. Use `Array.from` with functional chain instead of mutable push.

---

### [MAJOR] 2: Duplicate check in `addDeviceToRegistry` outside transaction (TOCTOU)
**File**: `packages/anypost-core/src/data/device-registry.ts:29`
**Confidence**: 82

**Issue**:
The `devicesMap.has(certificate.devicePeerId)` check on line 29 occurs before the `doc.transact()` block on line 31. In a CRDT system with concurrent operations, another peer's update could arrive between the check and the transaction, making the check stale. While Yjs handles concurrent writes via CRDT merge, the early return could skip adding a device that should be added based on newer state.

**Code**:
```typescript
if (devicesMap.has(certificate.devicePeerId)) return;

doc.transact(() => {
  // ...
});
```

**Fix**:
Move the duplicate check inside the transaction block.

---

### [MAJOR] 3: Stray import at bottom of test file
**File**: `packages/anypost-core/src/data/device-registry.test.ts:206`
**Confidence**: 95

**Issue**:
`import * as Y from "yjs"` appears at the very bottom of the file (line 206), after all test code. Imports must be at the top of the file per standard conventions. This appears to be an accidental placement.

**Code**:
```typescript
import * as Y from "yjs";
```

**Fix**:
Move the import to the top of the file with the other imports.

---

### [MINOR] 4: Missing test for non-Y.Map guard in `getRegisteredDevices`
**File**: `packages/anypost-core/src/data/device-registry.test.ts`
**Confidence**: 78

**Issue**:
Line 57 of `device-registry.ts` has a guard `if (!(value instanceof Y.Map)) return;` that filters out non-Y.Map entries from the devices map. No test exercises this defensive path. Adding a test that directly manipulates the Y.Doc to insert a non-Y.Map value would verify resilience to corrupted CRDT data.

---

### [MINOR] 5: `isDeviceRegistered` uses positional parameters while other functions use options objects
**File**: `packages/anypost-core/src/data/device-registry.ts:70`
**Confidence**: 72

**Issue**:
`isDeviceRegistered(doc, devicePeerId)` uses positional parameters while `addDeviceToRegistry`, `removeDeviceFromRegistry`, and `updateDeviceLastSeen` use options objects. However, `isDeviceRegistered` is a simple predicate with only 2 params, so positional is acceptable per the project conventions ("single-parameter pure functions" and well-established patterns are exceptions).

---

### [NIT] 6: No certificate signature verification before storing in registry
**File**: `packages/anypost-core/src/data/device-registry.ts:24`
**Confidence**: 55

**Issue**:
`addDeviceToRegistry` stores the certificate without verifying its signature. However, this is a data layer function — certificate verification should happen at the protocol/caller layer before reaching the registry. This is consistent with separation of concerns. Noted but not blocking.

---

## Verdict
NEEDS_FIXES

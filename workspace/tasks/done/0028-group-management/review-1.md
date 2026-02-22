# Self-Review #1

**Date**: 2026-02-22T14:10:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 2
- MINOR: 1
- NIT: 0

## Findings

### [MAJOR] 1: Missing edge-case tests for error paths
**File**: `packages/anypost-core/src/group-management.test.ts`
**Confidence**: 85

**Issue**:
The test suite only covers happy paths. No tests for:
- Inviting a member already in the MLS group (steward throws "already a group member")
- Removing a member not in the group (steward throws "not a group member")
- Non-member sender attempting operations (steward throws "Sender is not a group member")

**Fix**:
Add 3 edge-case tests verifying error propagation and that Yjs doc is NOT mutated on MLS failure.

---

### [MAJOR] 2: Date.now() called twice in createGroup produces inconsistent timestamps
**File**: `packages/anypost-core/src/group-management.ts:105,113`
**Confidence**: 82

**Issue**:
```typescript
createdAt: Date.now(),  // line 105
// ...
joinedAt: Date.now(),   // line 113 — different value
```
For the group creator, `createdAt` and `joinedAt` should logically be identical.

**Fix**:
Capture `Date.now()` once at the top of `createGroup` and use for both timestamps.

---

### [MINOR] 3: Substantial test setup duplication
**File**: `packages/anypost-core/src/group-management.test.ts`
**Confidence**: 80

**Issue**:
The same 12-line group creation block is repeated verbatim in 5+ tests. This is the same knowledge (how to create a valid group) duplicated.

**Fix**:
Extract a `setupGroup` factory function following the pattern in `steward.test.ts` with `setupSteward()`.

---

## Dismissed Findings

- **Non-atomic MLS + Yjs** (3/4 subagents): False positive. StewardState is immutable — caller's original preserved on throw. Yjs ops are simple synchronous map operations. No commits broadcast at this layer.
- **acceptInvite empty Yjs doc** (3/4 subagents): By design. Yjs sync happens via yjs-sync-provider over the network, not inline.
- **No role-based authorization** (1/4 subagents): Explicitly deferred per ticket ("Admin role deferred, out of scope for v1").
- **Test helper untyped** (1/4 subagents): Matches established codebase patterns.
- **Non-null assertions in tests** (1/4 subagents): Established codebase convention.
- **TextEncoder allocation** (1/4 subagents): Not a hot path, micro-optimization.

## Verdict
NEEDS_FIXES

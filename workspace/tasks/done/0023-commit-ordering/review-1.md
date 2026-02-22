# Self-Review #1

**Date**: 2026-02-22T12:30:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 1
- MAJOR: 3
- MINOR: 2
- NIT: 0

## Findings

### [CRITICAL] 1: memberIndex calculation incorrect after remove-then-add sequences
**File**: `packages/anypost-core/src/crypto/steward.ts:116`
**Confidence**: 95

**Issue**:
`getMemberCount(result.newGroupState) - 1` assumes the newly added member is always placed at the last leaf position in the MLS ratchet tree. This is incorrect. ts-mls's `addLeafNode` reuses blank leaf slots left by prior removals (via `findBlankLeafNodeIndex`). After a remove-then-add sequence, the new member may be placed at the removed member's former leaf index, not at the end.

Failure scenario: steward(0), bob(1), charlie(2) → remove bob → leaf 1 blank → add dave → ts-mls reuses leaf 1 → code computes `3-1=2` → dave recorded as index 2 (charlie's slot) → removing dave actually removes charlie.

All 4 review subagents independently identified this bug and verified it against ts-mls source code.

**Code**:
```typescript
const newMemberIndex = getMemberCount(result.newGroupState) - 1;
```

**Fix**:
Determine the actual leaf index by diffing the ratchet tree before and after the add operation, or by exposing the inserted leaf index from the mls-manager addMember function. Also add a test that exercises remove-then-add-then-remove to catch this bug.

---

### [MAJOR] 2: No duplicate-add protection
**File**: `packages/anypost-core/src/crypto/steward.ts:106-134`
**Confidence**: 82

**Issue**:
`processAddProposal` does not check whether the identity being added is already a member. Two "add Bob" proposals would create duplicate MemberRecord entries. `findMemberByIdentity` always returns the first match, making the duplicate unreachable for removal — a ghost member.

**Code**:
```typescript
const processAddProposal = async (
  state: StewardState,
  proposal: AddProposal,
): Promise<ProcessProposalResult> => {
  // No check: is proposal.identity already in state.members?
  const result = await addMember({ ... });
```

**Fix**:
Add guard: `if (isMember(state.members, proposal.identity)) throw new Error("Cannot add: identity is already a group member");`

---

### [MAJOR] 3: No test coverage for update proposal through processStewardProposal
**File**: `packages/anypost-core/src/crypto/steward.test.ts`
**Confidence**: 82

**Issue**:
The `update` proposal kind is only tested in the queue test (enqueue/drain). There is no test that calls `processStewardProposal` with `kind: "update"`. The entire `processUpdateProposal` function has zero behavioral test coverage through the public API.

**Fix**:
Add test:
```typescript
it("update proposal should advance epoch without changing membership", async () => {
  const { state } = await setupSteward();
  const result = await processStewardProposal({
    state,
    proposal: { kind: "update" },
    senderIdentity: makeIdentity("steward"),
  });
  expect(getEpoch(result.newState.groupState)).toBe(1n);
  expect(getStewardMembers(result.newState)).toHaveLength(1);
  expect(result.welcomeMessage).toBeUndefined();
  expect(result.commitBroadcast.commit).toBeDefined();
});
```

---

### [MAJOR] 4: MemberRecord type not exported but leaks through public API
**File**: `packages/anypost-core/src/crypto/steward.ts:19`
**Confidence**: 85

**Issue**:
`getStewardMembers` is exported and returns `readonly MemberRecord[]`, and `StewardState` (exported) has `members: readonly MemberRecord[]`. But `MemberRecord` itself is not exported. Consumers cannot properly type variables or parameters using this type.

**Fix**:
Export `MemberRecord` from steward.ts and add to barrel exports in index.ts.

---

### [MINOR] 5: `as never` type assertion in test violates project guidelines
**File**: `packages/anypost-core/src/crypto/steward.test.ts:174`
**Confidence**: 80

**Issue**:
`keyPackage: new Uint8Array(0) as never` completely bypasses the type system. Project guidelines state no type assertions without justification.

**Fix**:
Restructure the queue test to use proposal types that don't need a KeyPackage (update + remove), or make the test async and use real key packages.

---

### [MINOR] 6: identitiesMatch is not constant-time
**File**: `packages/anypost-core/src/crypto/steward.ts:65-67`
**Confidence**: 60

**Issue**:
`Array.every` short-circuits on first mismatch. While the identities are encoded display names (not cryptographic secrets), using constant-time comparison is best practice in a crypto module.

**Fix**:
Replace with XOR-based comparison loop:
```typescript
const identitiesMatch = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};
```

---

## Verdict
NEEDS_FIXES

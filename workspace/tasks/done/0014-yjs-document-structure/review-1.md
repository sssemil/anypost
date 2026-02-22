# Self-Review #1

**Date**: 2026-02-22T09:30:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 4
- MINOR: 2
- NIT: 1

## Findings

### [MAJOR] 1: All getter functions except getGroupMetadata lack schema validation at CRDT trust boundary
**File**: `group-document.ts:56-90`
**Confidence**: 95

**Issue**:
`getMembers` uses `as Member` type assertion, `getChannels` relies on TS generic `getArray<Channel>`, and `getChannelMessages` relies on `getArray<MessageRef>`. None validate at runtime. CRDT data from remote peers is untrusted. `getGroupMetadata` correctly uses `safeParse` — the other getters must follow suit.

**Fix**: Validate through MemberSchema, ChannelSchema, and MessageRefSchema respectively. Use `Array.from` + `safeParse` + filter pattern.

---

### [MAJOR] 2: setGroupMetadata performs 4 individual Y.Map mutations outside doc.transact()
**File**: `group-document.ts:16-22`
**Confidence**: 85

**Issue**:
Each `.set()` generates a separate Yjs update event. Sync handlers or observers can see partially-updated metadata. Yjs transactions batch mutations atomically.

**Fix**: Wrap in `doc.transact(() => { ... })`.

---

### [MAJOR] 3: New schemas and types not exported from shared/index.ts barrel
**File**: `shared/index.ts`
**Confidence**: 95

**Issue**:
ChannelSchema, MemberSchema, GroupMetadataSchema, MessageRefSchema and their types are not re-exported from shared/index.ts, breaking the established barrel export pattern.

**Fix**: Add all new schema/type exports to shared/index.ts.

---

### [MAJOR] 4: Test factories don't validate through schemas — inconsistent with shared/factories.ts pattern
**File**: `group-document.test.ts:28-60`
**Confidence**: 90

**Issue**:
Existing factories in `shared/factories.ts` validate through `.parse()`. New test factories return raw objects without schema validation. Should also be moved to shared/factories.ts for reuse.

**Fix**: Move to shared/factories.ts, validate through corresponding schemas.

---

### [MINOR] 5: addMember manually enumerates fields instead of spreading
**File**: `group-document.ts:40-46`
**Confidence**: 80

**Issue**: Inconsistent with `addChannel` and `appendMessage` which use `{ ...obj }`. Also duplicates knowledge of Member fields.

**Fix**: Use `{ ...member }` spread.

---

### [MINOR] 6: getMembers uses mutable push pattern
**File**: `group-document.ts:56-63`
**Confidence**: 80

**Issue**: Uses `push` which violates project immutability conventions. Should use `Array.from` functional approach.

**Fix**: Will be addressed as part of Finding 1's schema validation fix.

---

### [NIT] 7: Metadata key strings duplicated between setter and getter
**File**: `group-document.ts:16-36`
**Confidence**: 75

**Issue**: Field names "name", "description", "createdAt", "stewardPeerId" appear in both set/get. Could use Object.entries iteration.

**Fix**: Use Object.entries for setter, Object.fromEntries for getter.

---

## Verdict
NEEDS_FIXES

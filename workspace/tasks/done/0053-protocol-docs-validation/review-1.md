# Self-Review #1

**Date**: 2026-02-27
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 5
- MINOR: 12
- NIT: 6

## Findings

### [MAJOR] 1: `member-left` missing from Permission Matrix
**File**: `PROTOCOL.md` Section 4.6
**Confidence**: 100

**Issue**: Permission Matrix listed 13 of 14 action types, omitting `member-left`. An implementer would have no authorization rule for this action.

**Fix**: Added `| member-left | Author is member |` row. FIXED in 9e3fb0e.

---

### [MAJOR] 2: Sync request/response signing fields undocumented
**File**: `PROTOCOL.md` Section 5.4
**Confidence**: 95

**Issue**: Signing fields documented for heads_announce and block_fetch but NOT for sync_request/sync_response. An implementer cannot produce compatible signatures without this.

**Fix**: Added signing payload specifications for both message types. FIXED in 9e3fb0e.

---

### [MAJOR] 3: `lastMergeTimestampByAuthor` missing from Group State
**File**: `PROTOCOL.md` Section 4.6
**Confidence**: 98

**Issue**: Group State omitted the merge rate-limiting state field. Without it, merge rate limiting cannot be implemented.

**Fix**: Added `lastMergeTimestampByAuthor: Map<hex, number>` to Group State. FIXED in 9e3fb0e.

---

### [MAJOR] 4: `member-removed` says "admin" not "admin or owner"
**File**: `PROTOCOL.md` Section 4.6
**Confidence**: 95

**Issue**: Inconsistent with other rows (member-approved, group-renamed, join-policy-changed all say "admin or owner"). Could cause owners to be unable to remove members.

**Fix**: Changed to "Author is admin or owner". FIXED in 9e3fb0e.

---

### [MAJOR] 5: Block fetch response limits and wire framing undocumented
**File**: `PROTOCOL.md` Section 5.5
**Confidence**: 92

**Issue**: 1 MiB response size cap and 2 MiB lpStream frame limit not documented. An implementer could produce oversized responses.

**Fix**: Added response byte cap, wire framing note, and reordered auth steps (cheapest first). FIXED in 9e3fb0e.

---

### [MINOR] 6-17: Various documentation quality improvements (not blocking)

Noted but not fixed (no impact on interoperability):
- Profile/encrypted message schemas use compressed notation lacking payload wrapper
- No explicit list of which messages include protocolVersion
- approxDagSize excluded from signing without explanation
- role-changed ownership transfer semantics undocumented
- Orphan action handling undocumented
- Merge preconditions checked at creation time only
- No clock skew docs for heads_announce/sync messages
- GENESIS_HASH sentinel semantics could be clearer
- Partition tolerance behavior undocumented
- Tips vs heads terminology inconsistency
- Block fetch replay window not explicitly noted
- Block fetch no rate limiting (implementation gap, not doc error)

---

## Verdict
APPROVED — All MAJOR findings fixed. No CRITICAL issues. MINOR/NIT findings are quality improvements that don't affect protocol correctness or interoperability.

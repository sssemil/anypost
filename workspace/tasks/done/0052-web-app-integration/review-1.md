# Self-Review #1

**Date**: 2026-02-27T03:22:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 2
- MAJOR: 1
- MINOR: 2
- NIT: 0

## Findings

### [CRITICAL] 1: Non-null assertions on optional hashHex crash for legacy messages
**File**: `apps/anypost-web/src/App.tsx:3209,3279`
**Confidence**: 92

**Issue**: `fromHex(editTarget.hashHex!)` and `fromHex(message.hashHex!)` use non-null assertions on an optional field. Messages from v1.0 persistence or pre-sync state lack `hashHex`, causing runtime crash.

**Fix**: Added guard `if (!editTarget.hashHex) return;` and `if (!message.hashHex) return;` before `fromHex` calls. Removed `!` assertions.

---

### [CRITICAL] 2: Incomplete v1.0 migration leaves stale messages without hashHex
**File**: `apps/anypost-web/src/App.tsx:2519-2527`
**Confidence**: 88

**Issue**: Migration only cleared `ACTION_CHAINS_STORAGE_KEY` but left `GROUPS_STORAGE_KEY` with persisted v1.0 messages lacking `hashHex`. Ticket says "v1.0 groups will appear empty" but old messages persisted.

**Fix**: Added `localStorage.removeItem(GROUPS_STORAGE_KEY)` to migration. Also handled NaN protocol version as 0.

---

### [MAJOR] 3: fromHex accepts partial hex via parseInt silent truncation
**File**: `packages/anypost-core/src/protocol/action-chain.ts:115-124`
**Confidence**: 82

**Issue**: `parseInt("0g", 16)` returns 0 instead of NaN, silently corrupting data. The `NaN` check only catches fully invalid strings like "zz".

**Fix**: Added regex pre-check `/^[0-9a-fA-F]+$/` before parsing. Added test for partial hex input "0g0g".

---

### [MINOR] 4: hashHex not propagated through message reconciliation
**File**: `apps/anypost-web/src/App.tsx:1668-1683`
**Confidence**: 95

**Issue**: The reconciliation `.map()` that syncs canonical messages into group state didn't include `hashHex` in equality check or spread update, so messages already in state would never acquire their hash.

**Fix**: Added `message.hashHex === canonical.hashHex` to equality check and `hashHex: canonical.hashHex` to spread.

---

### [MINOR] 5: Mutable text/deleted on shared CanonicalMessage objects
**File**: `apps/anypost-web/src/App.tsx:1461-1470`
**Confidence**: 80

**Issue**: Pre-existing pattern of mutable fields on objects shared between two Maps. Amplified by adding `canonicalMessagesByHash`. Not blocking — pre-existing design, out of scope.

## Verdict
NEEDS_FIXES (CRITICALs 1,2 and MAJOR 3 fixed in commit 5759c90)

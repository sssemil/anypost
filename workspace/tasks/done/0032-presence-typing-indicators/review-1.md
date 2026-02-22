# Self-Review #1

**Date**: 2026-02-22T15:06:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1
- MINOR: 2
- NIT: 2

## Findings

### [MAJOR] 1: Unbounded memory growth — stale entries never pruned from heartbeats/typing maps
**File**: `packages/anypost-core/src/protocol/presence.ts:16-46`
**Confidence**: 92

**Issue**:
Every peer that has ever sent a heartbeat remains in the `heartbeats` Map permanently. `getOnlineMembers` filters expired entries at read time, but the underlying map grows monotonically. Same for `typing` — expired typing entries accumulate indefinitely per channel. In a long-running P2P node with peer churn, this is a memory leak.

**Code**:
```typescript
heartbeats: new Map([...tracker.heartbeats, [peerId, Date.now()]]),
```

**Fix**:
Add a `pruneExpired` function that removes entries older than their respective timeouts. Callers can invoke it periodically alongside the heartbeat broadcast interval.

---

### [MINOR] 2: Test constants duplicated from production code
**File**: `packages/anypost-core/src/protocol/presence.test.ts:11-12`
**Confidence**: 70

**Issue**:
`HEARTBEAT_TIMEOUT_MS` and `TYPING_TIMEOUT_MS` are redefined in the test file. If production values change, tests could use stale values. However, the behavioral assertions would still fail if the actual timeout behavior changes, limiting the real risk.

---

### [MINOR] 3: getOnlineMembers calls Date.now() per entry via isOnline
**File**: `packages/anypost-core/src/protocol/presence.ts:24-31`
**Confidence**: 60

**Issue**:
Each `isOnline` call within `getOnlineMembers` invokes `Date.now()` independently. A peer could appear in/out of the returned list inconsistently if right at the boundary. Low practical impact but technically imprecise.

---

### [NIT] 4: Missing boundary test at exact timeout threshold
**Confidence**: 50

Tests check `TIMEOUT + 1` (expired) and within timeout (active), but not exactly at the threshold.

---

### [NIT] 5: Missing immutability regression tests
**Confidence**: 50

No test verifies that the original tracker is not mutated after `recordHeartbeat`/`recordTypingStart`.

---

## Verdict
NEEDS_FIXES

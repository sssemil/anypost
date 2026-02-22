# Self-Review #1

**Date**: 2026-02-22T14:55:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 1
- MINOR: 2
- NIT: 2

## Findings

### [MAJOR] 1: sortOrder collision after channel deletion
**File**: `packages/anypost-core/src/data/group-document.ts:76`
**Confidence**: 85

**Issue**:
`createChannelInGroup` computes `sortOrder` as `channels.length`. After a deletion, this produces duplicate sort orders. Example: channels [0,1,2] → delete channel 1 → [0,2] (length=2) → create → new channel gets sortOrder=2, colliding with existing channel.

**Code**:
```typescript
const channels = getChannels(doc);
const sortOrder = channels.length;
```

**Fix**:
Use `Math.max(...channels.map(c => c.sortOrder)) + 1` instead of `channels.length`. Also add a test for create-after-delete scenario.

---

### [MINOR] 2: Redundant `as Channel` type assertion
**File**: `packages/anypost-core/src/data/group-document.ts:92`
**Confidence**: 85

**Issue**:
The `channelsArray` is typed `Y.Array<Channel>`, so `.get(i)` already returns `Channel`. The `as Channel` cast violates project TypeScript guidelines.

**Fix**:
Remove the type assertion: `if (channel && channel.id === channelId)`

---

### [MINOR] 3: No input validation in `createChannelInGroup`
**File**: `packages/anypost-core/src/data/group-document.ts:71-85`
**Confidence**: 80

**Issue**:
`createChannelInGroup` doesn't validate input against `ChannelSchema`. An empty `name` would be stored in the CRDT but filtered out by `getChannels`. Using `ChannelSchema.parse()` would also eliminate the `as ChannelId` assertion.

**Fix**:
Use `ChannelSchema.parse()` to construct the channel object.

---

### [NIT] 4: Orphaned Yjs arrays after channel deletion
**File**: `packages/anypost-core/src/data/group-document.ts:97-100`
**Confidence**: 40

**Issue**:
Yjs top-level types can't be removed. Empty `messages:${channelId}` arrays persist. This is a known Yjs limitation, not actionable.

---

### [NIT] 5: Imperative loop in deleteChannel
**File**: `packages/anypost-core/src/data/group-document.ts:90-95`
**Confidence**: 50

**Issue**:
Could use `toArray().findIndex()` for consistency with functional patterns. Minor style preference.

## Verdict
NEEDS_FIXES

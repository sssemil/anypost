# Self-Review #1

**Date**: 2026-02-22T15:40:00Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 3
- MINOR: 2
- NIT: 1

## Findings

### [MAJOR] 1: ICE candidate sdpMid and sdpMLineIndex should be nullable per WebRTC spec
**File**: `packages/anypost-core/src/media/signaling.ts:17-22`
**Confidence**: 92

**Issue**:
WebRTC spec defines both `sdpMid` (DOMString?) and `sdpMLineIndex` (unsigned short?) as nullable. Browsers emit ICE candidates where one or the other can be null. Current schema rejects these valid candidates.

**Fix**: Make both fields nullable, add refine to ensure at least one is non-null.

---

### [MAJOR] 2: Test factories bypass schema validation
**File**: `packages/anypost-core/src/media/signaling.test.ts:11-39`
**Confidence**: 90

**Issue**:
All factories in shared/factories.ts validate through schema.parse(). Signaling factories use plain object literals. Violates project testing guidelines.

**Fix**: Use SignalMessageSchema.parse() in each factory.

---

### [MAJOR] 3: No max length on SDP/candidate strings — unbounded payload
**File**: `packages/anypost-core/src/media/signaling.ts:10,14,18`
**Confidence**: 92

**Issue**:
SDP strings have no .max() constraint. Malicious peer can send megabyte-scale payloads. Real SDP is a few KB max. Other protocols use MAX_DATA_LENGTH guards.

**Fix**: Add .max() constraints (64KB for SDP, 4KB for candidate).

---

### [MINOR] 4: sdpMid allows empty string inconsistently with candidate .min(1)
**File**: `packages/anypost-core/src/media/signaling.ts:20`
**Confidence**: 82

---

### [MINOR] 5: Test assertions in if blocks could silently skip content verification
**File**: `packages/anypost-core/src/media/signaling.test.ts`
**Confidence**: 85

---

### [NIT] 6: encoded.length vs encoded.byteLength inconsistency with codec.test.ts
**File**: `packages/anypost-core/src/media/signaling.test.ts:113`
**Confidence**: 80

---

## Verdict
NEEDS_FIXES

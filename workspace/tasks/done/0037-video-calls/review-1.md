# Self-Review #1

**Date**: 2026-02-22T14:47:57Z
**Iteration**: 1 of 30

## Summary
- CRITICAL: 0
- MAJOR: 0
- MINOR: 2
- NIT: 1

## Findings

### [MINOR] 1: Missing immutability test for removePeer
**File**: `packages/anypost-core/src/media/video-call.test.ts`
**Confidence**: 83

**Issue**:
voice-call.test.ts explicitly tests `removePeer` immutability (lines 131-137). video-call.test.ts covers `addPeer` and `setCameraEnabled` immutability but omits `removePeer`. Implementation is correct (`filter` is non-mutating), but behavioral proof is missing — inconsistent with sibling module pattern.

---

### [MINOR] 2: Missing cross-field preservation test for setMuted
**File**: `packages/anypost-core/src/media/video-call.test.ts`
**Confidence**: 82

**Issue**:
The camera toggle tests verify peers and mute state are preserved. But mute/unmute tests don't verify `cameraEnabled` is preserved. This is unique to video-call since `cameraEnabled` doesn't exist in voice-call. Implementation is correct (uses spread), but the behavior is untested.

---

### [NIT] 3: Tests use scoped let for state accumulation
Established codebase pattern (voice-call.test.ts, presence.test.ts, connection-state.test.ts). Not shared mutable state — scoped within individual tests.

## Verdict
APPROVED

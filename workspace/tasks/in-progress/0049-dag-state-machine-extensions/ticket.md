# DAG & State Machine Extensions

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0002-dag-sync-merkle-v1-1.md`
**Phase**: 2 — DAG & State Machine Extensions

## Description

Add new pure functions to the DAG and state machine modules for frontier sync, parent selection, merge handling, and bulk processing.

### New functions in `packages/anypost-core/src/protocol/action-dag.ts`

1. **`findMissingHashes(localDag: ActionDagState, remoteHeads: ReadonlySet<string>): ReadonlySet<string>`**
   - Returns hashes from `remoteHeads` that are NOT in `localDag.actions`
   - This is the first step in the optimistic DAG diff algorithm

2. **`selectParentHashes(dag: ActionDagState, lastBuiltHead: Uint8Array | null, maxParents?: number): readonly Uint8Array[]`**
   - Default `maxParents = 4`
   - If `lastBuiltHead` exists and is a current tip, include it first
   - Fill remaining slots with oldest tips (by timestamp, then hash tiebreaker)
   - If no `lastBuiltHead`, select up to `maxParents` oldest tips

### New handler in `packages/anypost-core/src/protocol/action-chain-state.ts`

1. **`applyMerge`**: Checks membership only (consistent with other handlers). Returns updated state with `lastMergeTimestampByAuthor` entry for the author.
   - The ≥2 tips requirement and rate limit are validated externally in `processSignedAction`

### New function in `multi-group-chat.ts` (or extracted sync module)

1. **`processBulkSignedActions(envelopes: SignedActionEnvelope[], dag: ActionDagState, groupState: ActionChainGroupState): { dag: ActionDagState, groupState: ActionChainGroupState, accepted: SignedAction[] }`**
   - Appends all envelopes to DAG (verify signatures, dedup)
   - Runs `topologicalOrder` once on the full DAG
   - Runs `deriveGroupState` once over the full ordered set
   - Returns updated DAG + group state + list of accepted actions
   - Used by block fetch response handler to avoid O(n²) replay

### Merge validation in `processSignedAction`

Add merge-specific validation before calling `applyAction`:
- Check `payload.type === "merge"`
- Verify action references ≥2 current tips in DAG
- Check `lastMergeTimestampByAuthor` for rate limit (action.timestamp - lastMerge ≥ 60s)
- Reject with clear error if validation fails

### parentHashes max-4 enforcement in `processSignedAction`

Add explicit check: if `action.parentHashes.length > 4`, reject. This supplements the schema-level `.max(4)` constraint.

## Acceptance Criteria

- [ ] `findMissingHashes` returns correct set for: empty local DAG, partial overlap, fully synced, disjoint heads
- [ ] `selectParentHashes` includes lastBuiltHead when it's a tip, fills remaining with oldest tips, respects maxParents
- [ ] `selectParentHashes` handles: no tips (genesis), single tip, more tips than maxParents, lastBuiltHead not a tip
- [ ] `applyMerge` checks membership and updates `lastMergeTimestampByAuthor`
- [ ] Merge validation rejects: non-member, <2 tip references, rate limit violation
- [ ] Merge validation accepts: member with ≥2 tips, respecting rate limit
- [ ] `processBulkSignedActions` produces same final state as processing actions one-by-one
- [ ] `processBulkSignedActions` handles: empty batch, single action, duplicates, invalid signatures
- [ ] parentHashes >4 rejected at processing level with clear error
- [ ] All functions are pure (no side effects)
- [ ] All new functions tested with behavior-focused tests

## Implementation Notes

- `findMissingHashes` is trivially simple — filter remote heads by membership in local DAG's actions map. But test it thoroughly because it's the algorithmic core of sync.
- `selectParentHashes` needs the DAG's `tipHashes` set and the actions map (for timestamp lookup). The tiebreaker should be consistent with `topologicalOrder` (timestamp ascending, then hash hex ascending).
- `processBulkSignedActions` is the key optimization. The critical invariant: it MUST produce the same derived state as processing each action individually through `processSignedAction`. Test this with a property: for any set of valid envelopes, bulk processing = sequential processing.
- For merge rate limiting, the timestamp comparison is in the topo-ordered context, not wall-clock time.

## Dependencies

- Blocked by: 0048 (core schemas must be updated first)
- Blocks: 0050, 0051

## History

- 2026-02-26 Created from brutal-plan PLAN-0002

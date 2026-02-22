# Spike D: DMLS Investigation

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 0 — Technical Spike

## Description

Research and prototype Distributed MLS (DMLS) extensions for decentralized commit ordering. DMLS eliminates the single-committer requirement of standard MLS by using per-member "Send Groups" and DAG-based epoch identifiers.

Throwaway code — no TDD requirement for spikes.

Key areas to investigate:
- Per-member "Send Groups" that allow any member to commit independently
- DAG-based epoch identifiers for handling concurrent commits
- Puncturable PRFs for init_secret management across concurrent epochs
- Feasibility of implementing DMLS on top of ts-mls
- Whether DMLS provides meaningful benefits over the steward model for our use case

## Acceptance Criteria

- [ ] DMLS research summary written (key papers, approaches, trade-offs)
- [ ] Feasibility assessment: can DMLS be implemented on top of ts-mls?
- [ ] If feasible: prototype concurrent commits from 2+ peers without steward
- [ ] If infeasible: document why and confirm steward model as fallback
- [ ] Go/no-go recommendation with clear rationale

## Implementation Notes

- Key DMLS concepts: Send Groups, DAG epochs, puncturable PRFs
- The pragmatic steward model (designated committer per group) is the fallback
- Even if DMLS proves feasible, it may be deferred to Phase 6 if complexity is high
- Focus on understanding: does ts-mls's API support the extension points needed?
- Consider: is the UX improvement of DMLS worth the implementation complexity?
- Steward model limitations: steward must be online for member add/remove

## Dependencies

- Blocked by: None
- Blocks: 0006

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

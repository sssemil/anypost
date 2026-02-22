# Relay Redundancy (Health Checking, Automatic Failover)

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 6 — Hardening

## Description

Implement relay redundancy with health checking and automatic failover. Configure at least 3 relay/bootstrap nodes. Browser peers health-check relays and automatically switch to a healthy one if the current relay goes down. TDD required.

## Acceptance Criteria

- [x] Multiple relay addresses configurable (at least 3)
- [x] Health checking: periodic ping to connected relay
- [x] Automatic failover to next healthy relay on disconnect
- [x] Relay selection: prefer lowest-latency relay
- [x] All tests pass via TDD

## Implementation Notes

- Bootstrap peer list: 3+ relay multiaddresses hardcoded (configurable via settings)
- Health check: libp2p ping protocol every 30 seconds
- Failover: on relay disconnect or health check failure → try next relay in list
- Relay ranking: sort by latency (measure round-trip time), prefer lowest
- Consider: relay discovery via DHT/rendezvous for production (currently hardcoded)
- Reference saved-v3's relay management patterns

## Dependencies

- Blocked by: 0011, 0042
- Blocks: None

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
- 2026-02-22 15:49 Started work on this task
- 2026-02-22 15:52 Implementation complete, starting code reduction
- 2026-02-22 15:53 Code reduction complete, starting self-review
- 2026-02-22 15:55 Self-review #1: 0 CRITICAL, 3 MAJOR, 2 MINOR — fixed degraded fallback, latency validation, type-safe sort
- 2026-02-22 15:59 Self-review #2: 0 CRITICAL, 1 MAJOR, 2 MINOR — reordered degraded-over-unknown priority, added failure reset test
- 2026-02-22 16:00 Task completed. Final review passed with 0 CRITICAL, 0 MAJOR findings.

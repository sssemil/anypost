# Monorepo Scaffolding

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Set up the 3-workspace monorepo structure with pnpm, Turborepo, shared tsconfig (strict mode), and Vitest workspace config. This is pure configuration — no tests required.

Workspaces:
- `anypost-core` — all library code with directory-level organization (`src/crypto/`, `src/data/`, `src/protocol/`, `src/media/`, `src/libp2p/`, `src/shared/`)
- `anypost-web` — SolidJS app
- `anypost-relay` — minimal Node.js relay/bootstrap server

## Acceptance Criteria

- [ ] pnpm workspace configured with 3 workspaces
- [ ] Turborepo configured with build, test, lint, typecheck pipelines
- [ ] Shared tsconfig.base.json with TypeScript strict mode (all strict flags enabled)
- [ ] Per-workspace tsconfig extending base
- [ ] Vitest workspace config with shared test settings
- [ ] `pnpm build` succeeds (empty packages)
- [ ] `pnpm test` succeeds (no tests yet)
- [ ] `pnpm typecheck` succeeds
- [ ] ESM-only configuration (type: "module" in all package.json)

## Implementation Notes

- Use pnpm workspace protocol for internal dependencies
- anypost-core should have a single package.json with directory-level organization inside src/
- Turborepo pipelines: build depends on ^build, test depends on build
- tsconfig strict mode must include: strict, noImplicitAny, strictNullChecks, strictFunctionTypes, noUnusedLocals, noUnusedParameters, noImplicitReturns, noFallthroughCasesInSwitch
- Vitest config should support browser mode (needed later for IndexedDB/WebCrypto tests)
- Consider adding a root-level `.nvmrc` or `engines` field for Node.js version

## Dependencies

- Blocked by: 0006
- Blocks: 0008, 0010, 0011, 0018

## History

- 2026-02-22 Created from brutal-plan PLAN-0001

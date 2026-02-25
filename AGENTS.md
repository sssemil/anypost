# AGENTS.md

Guidance for coding agents working in this repository.

## Project Layout
- `packages/anypost-core`: protocol, crypto, persistence, and libp2p logic.
- `apps/anypost-web`: SolidJS frontend and headless browser integration scripts.
- `apps/anypost-android`: Capacitor Android wrapper target for the web app.
- `apps/anypost-relay`: optional relay service.
- `run`: convenience entrypoint for common local tasks.

## Core Commands
- Install: `pnpm install --frozen-lockfile`
- Dev web: `./run web`
- Dev electron: `./run electron`
  - Profiled instance: `./run electron alice`
  - If Linux sandbox blocks launch locally: `./run electron alice --no-sandbox`
- Android sync: `./run android-sync`
- Android open: `./run android-open`
- Android debug APK: `./run android-build-apk`
- Build all: `./run build`
- Test all: `./run test`
- Typecheck all: `./run typecheck`
- Headless diagnostics flow: `./run e2e-record`
- Build electron desktop bundle: `pnpm --filter anypost-electron build`

## Integration Tests (Browser / IPFS)
- DM no-relay integration:
  - `pnpm --filter anypost-web run e2e:dm-no-relay-ipfs`
- DM refresh continuity integration:
  - `pnpm --filter anypost-web run e2e:dm-refresh-ipfs`
- Reliability soak runner:
  - `pnpm --filter anypost-web run e2e:soak -- --iterations 10`

Important:
- For browser integration tests, prefer IPFS/libp2p paths without depending on a local relay in invite payloads unless the scenario explicitly requires relay inclusion.
- Keep artifacts in `artifacts/` or `apps/anypost-web/artifacts/`; do not commit generated logs/recordings.

## Change Checklist
When changing protocol, sync, invite, membership, DM, or discovery behavior:
1. Run targeted tests first (`anypost-core` or `anypost-web` as needed).
2. Run full package tests for touched packages.
3. Run at least one browser integration flow (`e2e:dm-no-relay-ipfs`).
4. For reliability-sensitive changes, run soak (`e2e:soak`) and report pass/fail count.

## CI Expectations
- `ci.yml` runs unit/integration tests and headless validation.
- `soak.yml` runs scheduled/manual soak iterations with artifacts upload.

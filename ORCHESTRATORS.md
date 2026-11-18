# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

### atlas-module
- Orchestrator session: autre session (backfilled)
- Owning: #8 (DB-1, DB-2)
- Branch(es): `feat/8-atlas-module`
- PR: #27, CI green
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T06:56Z
- lastTouch: 2026-11-18T07:12Z (backfilled)
- Touch these files only: `lib/db.ts`, `lib/seed.ts`, `lib/shared.ts`, `workers/dispatcher.ts`, `workers/memory-keeper.ts`
- Status: waiting on merge/review

### aws-infra
- Orchestrator session: autre session (backfilled)
- Owning: #6 (INF-1, INF-2, INF-3, OBS-1)
- Branch(es): `feat/6-aws-infra`
- PR: #29, CI RED (tsc picks up `infra/`; `aws-cdk-lib`/`constructs` not in root install)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:03Z
- lastTouch: 2026-11-18T07:12Z (backfilled)
- Touch these files only: `infra/**`
- Status: needs fix — `tsconfig.json` must exclude `infra/` (it has its own package.json)

### ci-mongo
- Orchestrator session: autre session (backfilled)
- Owning: #11 (CI-2)
- Branch(es): `feat/11-ci-mongo`
- PR: #30, mongo job RED (`api:check` — `/api/chat/token` route not in `lib/openapi.ts`)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:05Z
- lastTouch: 2026-11-18T07:12Z (backfilled)
- Touch these files only: `.github/workflows/ci.yml`
- Status: needs fix — either document `/api/chat/token` in `lib/openapi.ts` or exclude it from `api:check`

### live-model-check
- Orchestrator session: autre session (backfilled)
- Owning: #23 (LLM-1 live, LLM-3b)
- Branch(es): `feat/23-live-check`
- PR: #31, CI green
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:05Z
- lastTouch: 2026-11-18T07:12Z (backfilled)
- Touch these files only: `docs/agents/live-model-check.md`
- Status: awaiting merge; documents the live smoke result

## History

<!-- Lanes that are done get moved here with their closed issues, or just deleted. -->

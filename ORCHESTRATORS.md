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
- Status: ready to merge

### aws-infra
- Orchestrator session: autre session (backfilled)
- Owning: #6 (INF-1, INF-2, INF-3, OBS-1)
- Branch(es): `feat/6-aws-infra`
- PR: #29, CI green (tsconfig exclude fix pushed by orchestrator)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:03Z
- lastTouch: 2026-11-18T07:20Z
- Touch these files only: `infra/**`, `tsconfig.json`
- Status: ready to merge

### ci-mongo
- Orchestrator session: autre session (backfilled)
- Owning: #11 (CI-2)
- Branch(es): `feat/11-ci-mongo`
- PR: #30, CI green (openapi entry for /api/chat/token pushed by orchestrator)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:05Z
- lastTouch: 2026-11-18T07:20Z
- Touch these files only: `.github/workflows/ci.yml`, `lib/openapi.ts`
- Status: ready to merge

### live-model-check
- Orchestrator session: autre session (backfilled)
- Owning: #23 (LLM-1 live, LLM-3b)
- Branch(es): `feat/23-live-check`
- PR: #31, CI green
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:05Z
- lastTouch: 2026-11-18T07:12Z (backfilled)
- Touch these files only: `docs/agents/live-model-check.md`
- Status: ready to merge

### feeds-directory (worktree, no PR yet)
- Orchestrator session: autre session (local worktree `.worktrees/10`)
- Owning: #10 (WS-1, WS-2, WS-3)
- Branch(es): `feat/10-feeds` (committed 0453903, clean)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18 (unpushed)
- lastTouch: 2026-11-18T07:18Z
- Touch these files only: `agents/research/news-search.ts`, fixtures, help-desk directory
- Status: committed locally, not pushed, no PR

### uswds-coordinator (worktree, no PR yet)
- Orchestrator session: autre session (local worktree `.worktrees/17`)
- Owning: #17
- Branch(es): `feat/17-uswds-coordinator` (committed a2a90a4, clean)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18 (unpushed)
- lastTouch: 2026-11-18T07:18Z
- Touch these files only: coordinator screens
- Status: committed locally, not pushed, no PR

### uswds-map (worktree, in progress)
- Orchestrator session: autre session (local worktree `.worktrees/18`)
- Owning: #18
- Branch(es): `feat/18-uswds-map`
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18 (unpushed)
- lastTouch: 2026-11-18T07:18Z
- Touch these files only: `components/map/**`, ops-room screens
- Status: in progress (untracked `components/map/basemaps.ts`)

### photos (worktree, in progress, DECISION CONFLICT)
- Orchestrator session: autre session (local worktree `.worktrees/22`)
- Owning: #22 (D-0016)
- Branch(es): `feat/22-photos-d0016`
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18 (unpushed)
- lastTouch: 2026-11-18T07:18Z
- Touch these files only: `lib/schemas.ts`, `lib/types.ts`, `agents/personal/tools.ts`, `docs/decisions/0016-*.md`
- Status: builds **option 3** (attach-only, no model reads photos). CONFLICT: Dan re-confirmed option 2 (photos work immediately, vision model). Don't let this record land as accepted.

## History

<!-- Lanes that are done get moved here with their closed issues, or just deleted. -->

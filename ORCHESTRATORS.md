# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

### photos-vision (Dan's session)
- Orchestrator session: Dan's session
- Owning: #39 (PHO-1)
- Branch(es): `feat/39-vision-model`
- PR: #42 open — vision default `nvidia/nemotron-3.5-super-vl` (provisional); needs Dan's confirm on the model id + price, then an evaluator PASS before merge
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:35Z
- lastTouch: 2026-11-18T07:38Z
- Touch these files only: `agents/shared/llm.ts`, `agents/personal/turn.ts`, `agents/personal/prompts.ts`, `agents/personal/tools.ts`

### voice (Dan's session, in flight)
- Orchestrator session: Dan's session
- Owning: #14 (VOX-1, VOX-2)
- Branch(es): none yet — work is uncommitted in the root worktree, which is checked out on `feat/39-vision-model`
- On disk: `agents/shared/voice/` (aws.ts, elevenlabs.ts, port.ts, sigv4.ts) + package.json/lock changes
- Hazard: must land on `feat/14`, not ride PR #42
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18 (uncommitted)
- Touch these files only: `agents/shared/voice.ts`, `agents/shared/voice/**`, `components/talk/**`

### identity (staged, no owner)
- Owning: #12 (ID-1..ID-4) — waiting Dan's call on who runs it
- Branch(es): `feat/12-identity` in worktree `.worktrees/12`, clean from main
- Repo: Danvu772/DisasterDeck

## History

- atlas-module (#8), aws-infra (#6), ci-mongo (#11), live-model-check (#23), feeds-directory (#10), uswds-coordinator (#17), uswds-map (#18, PR #40): all merged 18 Nov.
- Photos: D-0016 option 2 locked (design PR #38); option-3 branch (#36) closed, superseded; build is #39 (PR #42).
- Stale worktrees to prune when confirmed: `.worktrees/10`, `.worktrees/17`, `.worktrees/18`, `.worktrees/22`.

# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

### photos-vision (this orchestrator)
- Orchestrator session: Dan's session
- Owning: #39 (PHO-1), #22 (D-0016, option 2 locked)
- Branch(es): TBD (`feat/39-vision-model`)
- Repo: Danvu772/DisasterDeck
- Started: 2026-11-18T07:35Z
- lastTouch: 2026-11-18T07:35Z
- Touch these files only: `agents/shared/llm.ts`, `agents/personal/turn.ts`, `lib/schemas.ts`, `lib/types.ts`, `scripts/llm-adapter.test.mjs`

## History

- atlas-module (#8), aws-infra (#6), ci-mongo (#11), live-model-check (#23), feeds-directory (#10), uswds-coordinator (#17), uswds-map (#18): all merged 18 Nov. Photos #36 (option 3) closed, superseded.

# AGENTS.md

Every agent reads this first, whatever tool it runs in. The workflow is Dan's: [`.claude/skills/dans-agentic-workflow-engineering/SKILL.md`](.claude/skills/dans-agentic-workflow-engineering/SKILL.md) (Kickoff → Design → Build). This file holds this repo's Kickoff answers. Only Dan changes them.

## Kickoff (17 Nov 2026)

| Question | Answer |
|---|---|
| Tier | **2 Product.** Real agencies, a startup. Full loop on every issue, CI on every merge |
| Design | [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md). Locked when Dan merges it. Decisions: [`docs/decisions/`](docs/decisions/) |
| Voters | Dan only. He owns the fork. No tie-break needed |
| People and lanes | Dan (`Danvu772`). No other people, no role lanes |
| Orchestrator | The agent session Dan starts as orchestrator. It is the single point of entry for design questions, cuts issues from the design, and assigns builders and evaluators |
| Tracker | GitHub Issues on `Danvu772/DisasterDeck`. Always pass `--repo Danvu772/DisasterDeck` (`gh` defaults to the upstream parent on a fork) |
| Requirements | [`tests/requirements.json`](tests/requirements.json): requirement ID, design section, check, `passes` |
| State | [`PROGRESS.md`](PROGRESS.md), so any agent can pick up |
| Deploy | Promote from `main` only when Dan asks. Today: `git push origin main:prod` to Vultr. After D-0002: AWS, by tag |

### Done check (every issue)

An issue is done when all of these hold, with evidence in the PR:

1. Its requirement IDs in `tests/requirements.json` have checks, and they pass.
2. CI is green: `tsc`, `eslint`, `next build`, the replay tests and the token checks in `.github/workflows/ci.yml`. Once USWDS lands, axe too (D-0001).
3. Any Brain or API change also passes the Mongo-backed checks that CI can't run (`keeper:check`, `sweeper:check`, `api:check`, `security:check`), run by hand against a throwaway desk, with the output pasted in the PR.
4. An evaluator agent that is not the builder grades it under R5 and reports PASS for every requirement. UNKNOWN counts as FAIL.
5. No invariant in `docs/SYSTEM_DESIGN.md` §2 is broken, and no decision record is contradicted without a `design/` PR first.

## The loop

1. **Explore and plan.** The builder reads the issue, its design section, its requirement IDs and the code. The orchestrator checks the plan against the design before any code.
2. **Tests first** from the requirement IDs.
3. **Build** on `feat/<issue#>-slug` (or `fix/`, `design/`, `chore/`) in its own git worktree until the tests pass.
4. **Evaluate.** A different agent gets the issue, the design section, the requirement IDs, the diff and the runnable checks, **never the builder's chat**. It answers PASS, FAIL or UNKNOWN per requirement, with evidence, and checks the claims in the PR description.
   When the evaluator's check critique leads the orchestrator to tighten a requirement, the orchestrator puts the new requirement text in the builder's next handoff. A builder is never graded against wording it hasn't seen (learned on #21, which lost a round to this).
5. **Merge.** Rebase on `main`, rerun checks, squash merge, delete the branch. The merge closes the issue.

**Loop cap:** three failed evaluations on one issue → stop. The builder hands the orchestrator all three rounds of findings. The orchestrator re-scopes the issue or opens a `design` issue.

## Rules

- **`main` always works.** Nobody, human or agent, commits to it directly. Every change is branch → PR → merge.
- **One issue → one short-lived branch → one PR.** The PR says `Closes #N`, lists its requirement IDs and says what was checked (template: `.github/pull_request_template.md`).
- **Parallel builders** only on issues whose files don't overlap, each in its own worktree.
- **The design changes only through a `design/` PR**: `SYSTEM_DESIGN.md` + a new record in `docs/decisions/` + updated requirements. It merges before any code that depends on it. A code PR that needs a design change stops and asks the orchestrator.
- **Fixes:** bug → issue → `fix/` branch → first a failing test that reproduces it, then the fix.
- **`decision` issues are Dan's.** Put the options and a recommendation in front of him and stop.
- **Never close an issue for Dan** outside a merge. Comment with what was done.
- **Personal settings stay personal:** `CLAUDE.local.md`, `.claude/settings.local.json`, your own tool config.

## What went wrong at the hackathon (don't repeat it)

From the upstream repo's issues and docs, 14 to 16 Nov:

- **The design drifted from the code.** `docs/ARCHITECTURE.md` said the keeper handled 6 event types after it handled 11, and the repo and vault copies of the Role 1 doc disagreed (upstream #16). → The design changes only through `design/` PRs, and the evaluator checks contract compliance.
- **Work sat on unmerged branches.** The p-001 to p-003 proposals never got reviewed or closed (upstream #10), so the frontend waited on fixtures. → Short branches, merged within a day.
- **Test data leaked onto the live desk** ("address unknown" sites, upstream #31 and #36). → Checks write only to throwaway desks and delete what they made.
- **Integration came last.** Every screen polled routes that didn't exist yet (`api_front_back_gap/GAPS.md`). → Vertical slices: each issue cuts through API, Brain and screen together.
- **"Agentic" everywhere.** → Invariant 3: rules allocate, the LLM explains. An issue that adds an LLM call where a rule would do fails evaluation.
- **The checks that matter didn't run in CI.** → The done check makes the Mongo-backed checks mandatory evidence for Brain and API changes until they run in CI.

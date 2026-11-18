---
name: dans-agentic-workflow-engineering
description: Dan's multi-agent workflow: kick off each repo with a workflow review, lock the system design, then one orchestrator runs design-derived issues. Works for teammates on other agent tools. Use for any new repo.
---

# Dan's agentic workflow engineering

## Core (read this; open the reference sections only when needed)

**Kickoff → Design → Build.** Nothing here is a hard rule for every repo; Kickoff decides what applies.

**Kickoff.** With Dan and every collaborator: pick the tier (R1), the done check, who votes on design and the tie-break, everyone's lanes and tools, and the orchestrator. Review what went wrong last project. Write it all into `AGENTS.md`.

**Design.** The orchestrator grills **everyone with a vote** until every branch is resolved, then writes `docs/SYSTEM_DESIGN.md` (components, contracts, locked decisions, glossary) and, at Tier 1+, `tests/requirements.json`. All voters sign off. The design is locked.

**Build.** The orchestrator is the single point of entry for design questions. It cuts the design into vertical-slice issues in dependency order, assigns agents and people, and runs issues in parallel only when their files don't overlap. Each issue runs its tier's loop (R1).

**Disagreements** go through the orchestrator and a real conversation between people, then a vote (R2). Nobody works around one in their own branch.

**Every change is branch → PR → merge (R4).** Features, fixes and design changes alike. Merging the PR is the review gate.

**Collaborators** can use any agent tool, as long as their work goes through the shared artifacts (R3).

**Every session Dan opens is an orchestrator.** It is the single point of entry for design questions. Its steady job: (1) keep Dan's desk fed — hand him tasks and decisions to make; (2) after a decision, delegate the work to builder and evaluator agents, choosing the model per task to stay token-efficient; (3) keep the lane registry honest so a second orchestrator never steps on its toes. Orchestrators coordinate only through the shared artifacts; there is no side-channel.

**A change reaches every future session the moment it lands in a shared artifact.** There is no in-memory or chat state to inherit. All a change has to do is make it into `AGENTS.md`, the SKILL, `docs/SYSTEM_DESIGN.md`, a `docs/decisions/` record, `tests/requirements.json`, `PROGRESS.md`, or `ORCHESTRATORS.md`, by the usual branch → PR → merge. On session start an orchestrator re-reads those files fresh, so the fork's newest state is what it operates from.

---

## R1. Tiers and the issue loop

| Tier | For | Issue names | Loop | Who closes |
|---|---|---|---|---|
| 0 Ship | Hackathons, demos | Design section | Orchestrator checks against design → build on a branch → review agent approves the PR (Kickoff decides what it looks at) → merge. No ground-truth check | Orchestrator |
| 1 Measure | Lab tools, instruments, research code | Design section + requirement IDs | Full loop + ground truth / known reference + reproducible runs | Orchestrator, then Dan spot-checks |
| 2 Product | Real users, startup | Design section + requirement IDs | Full loop + CI on every merge | Orchestrator, after the evaluator passes |
| 3 Regulated | Medical devices (IEC 62304 B/C) | Design section + requirement IDs + risk items | Full loop + per-item risk analysis + bidirectional traceability + evidence kept for every test | **Human only.** Agents produce evidence, people sign |

**Full loop:** (1) explore and plan; the orchestrator checks the plan against the design. (2) Write tests first from the requirement IDs. (3) Build until they pass. (4) A different agent than the builder evaluates under the evaluator contract (R5). (5) Merge the PR once the tier's reviewer approves; the merge closes the issue.

**Loop cap:** if an issue fails evaluation 3 times, stop. Repeated failure usually means the issue or the design is wrong, not the code. The builder hands the orchestrator the findings from all 3 rounds; the orchestrator re-scopes the issue or opens a `design` issue (R2).

## R2. Design disagreements

**File** a `design` issue: what to change and why. Only dependent work pauses.

**Brief.** The orchestrator writes up both positions fairly, the trade-offs, what each option costs (issues, tests, time), and the single question to decide.

**Talk.** The orchestrator tells both people by name to talk directly (call, in person, or a live thread), not through agents, and gives each the brief.

**Vote** on the issue. Still split → the Kickoff tie-break (default: the design owner decides and the dissent is recorded).

**Record and apply.** Decision record in `docs/decisions/` with the outcome and dissent → update the design → then issues and tests.

**Tier 3 override:** no design-owner tie-break. Every design change needs (a) the risk analysis redone for affected items, (b) traceability updated, and (c) signed approval from the approvers Kickoff named, all **before** any issue or code changes. No agreement means no change.

## R3. Shared artifacts (the collaboration contract)

| Artifact | Purpose |
|---|---|
| `AGENTS.md` | Cross-tool instructions every agent reads. `CLAUDE.md` = `@AGENTS.md` + anything Claude-specific |
| `docs/SYSTEM_DESIGN.md` | Locked design and glossary |
| `docs/decisions/` | One record per design decision, including dissent |
| `tests/requirements.json` | Requirement ID, design section, check, `passes` (Tier 1+) |
| Issue tracker | One vertical slice per issue |
| PR | Links its issue and meets the done check. How every tool and person gets work in |
| `PROGRESS.md` | Current state, so anyone can pick up |

Personal skills and settings stay personal (`CLAUDE.local.md`, `.claude/settings.local.json`, the person's own tool config).

## R4. Git flow (GitHub flow)- **`main` always works.** Nobody, human or agent, commits to it directly. Turn on branch protection.
- **One issue → one short-lived branch → one PR.** Branch names: `feat/<issue#>-slug`, `fix/…`, `design/…`, `chore/…`. Keep branches small and merge them within hours to a day.
- **Parallel agents** each work in their own git worktree on their own branch, so they never share a checkout.
- **The PR** links its issue (`Closes #N`), lists the requirement IDs it satisfies (Tier 1+), and says what was checked.
- **Merging is the review gate.** Who approves depends on the tier. Tier 0: the review agent. Tier 1: the review agent plus Dan's spot-check. Tier 2: green CI plus the evaluator agent. Tier 3: required human approvals, recorded on the PR.
- **Before merging:** rebase on `main`, rerun the checks, squash merge, delete the branch.
- **Fixes:** bug → issue → `fix/` branch. At Tier 1+, first write a test that reproduces the bug and fails, then fix it.
- **Design changes get their own `design/` PR:** `SYSTEM_DESIGN.md` + the decision record + updated requirements. It merges **before** any code that depends on it. A code PR never quietly changes the design; if it has to, stop and run R2.
- **Deploys:** promote from `main` by a tag or a release branch, however Kickoff decided.

## R6. Orchestrators and lanes (who is doing what, right now)

Multiple orchestrators can run at once (different repos, or different workstreams in one repo). They must not step on each other. The single source of truth for "who is doing what" is `ORCHESTRATORS.md` at the repo root, because a file is visible to every session, while a live conversation is visible to none.

**On session start, before any work:**

1. Re-read the shared artifacts fresh (`AGENTS.md`, `docs/SYSTEM_DESIGN.md`, `docs/decisions/`, `tests/requirements.json`, `PROGRESS.md`, `ORCHESTRATORS.md`). This is how a change propagates.
2. Claim or check your lane in `ORCHESTRATORS.md`. Record what you are orchestrating, the branch(es) and issue(s), and a `lastTouch` heartbeat. If another orchestrator already owns what you were about to take, don't silently double-up: put the overlap in front of Dan.

**While working:** update the heartbeat and any new branch/issue before and after each significant action.

**On exit:** strike your lane. A stale lane without a recent heartbeat is a dead session; treat it as unowned and confirm with Dan before taking it.

**Conflict rule:** two orchestrators must not drive the same issue or touch the same files. Read git too (branches, PRs, uncommitted work in any checkout) as the corroborating source of truth. The lane file says intent; git says what actually happened.

## R5. Evaluator contract

The evaluator is whatever approves the work before merge: the Tier 0 review agent or the Tier 1+ evaluator.

**Inputs:** the issue, its design section, its requirement IDs, the diff, and whatever can be run (tests, the app, a measurement rig). **Never the builder's chat or reasoning**, because the evaluator would inherit the builder's excuses. Grade what the work actually does, not what the builder says it did.

**Grader order:** prefer checks run by code (tests, scripts, measured numbers) because they're fast and repeatable. Use LLM judgment only where code can't decide, and give it a concrete rubric taken from the requirements, never "looks good." Humans are the gold standard and are reserved for the tier's gate.

**Output:** for each requirement (or, at Tier 0, each part of the issue):

- `PASS`: with evidence (command output, test result, screenshot, numbers).
- `FAIL`: what's wrong and where. Surface-level compliance counts as FAIL, e.g. a file that exists but holds the wrong content.
- `UNKNOWN`: not enough evidence to decide. Treat it as FAIL for merging.

No evidence means no PASS.

**Also:**

- **Check the builder's claims.** Pull factual claims out of the PR description ("handles empty input", "all tests pass") and verify them.
- **Critique the checks.** Flag any requirement that would also pass for clearly wrong work, and any important behavior no requirement covers. Send these to the orchestrator so it can fix `requirements.json`.
- **Tier 2+:** run several independent reviewers in parallel (correctness, design and contract compliance, security), score each finding's confidence, and only report high-confidence findings, so noise doesn't bury real problems.
- **Calibration (Tier 1+):** when Dan spot-checks, compare his call with the evaluator's. If they keep disagreeing, fix the rubric, not the code.

# Progress

Current state, so any agent or person can pick up. The orchestrator updates this at the end of every session.

**Phase:** Design. `docs/SYSTEM_DESIGN.md` v3 is in PR #2. It locks when Dan merges it.

## Waiting on Dan

- Merge PR #2 (design v3) and PR #3 (this workflow).
- Pick the 9 open calls under "Decide next" in the DisasterDeck HQ doc's Your Desk tab: the web search provider plus `SYSTEM_DESIGN.md` §8 items 2 to 7.
- Turn on Issues for the fork (Settings → General → Features) and branch protection on `main` (Settings → Branches). Agents can't change repo settings.

## Next for the orchestrator

1. Write each of Dan's §8 picks as a decision record and update the design, in one `design/` PR.
2. Write the requirements into `tests/requirements.json` from the locked design.
3. Cut the design into vertical-slice issues in dependency order, starting with D-0002 (AWS infrastructure as code) and D-0003 (model adapter), since most other work sits on them.

## Done

- 17 Nov: system design v3, decision records D-0001 to D-0008, fork made the tracker (PR #2).
- 17 Nov: Dan's workflow added: `AGENTS.md`, skill, `PROGRESS.md`, requirements file, PR template.

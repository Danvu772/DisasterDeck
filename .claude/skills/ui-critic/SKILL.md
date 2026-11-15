---
name: ui-critic
description: Iterative UI/UX critic and fixer loop for the Disaster Deck. A critic walks our running app and two reference sites in the built-in browser, writes a findings report under docs/ui-critic/, a fixer fixes the findings in code, and the critic re-checks until no high-severity findings remain or the round limit is hit. Use when asked to "critique the UI", "run the UI critic", "UI review loop", "compare our screens with the references", or to fix findings from a docs/ui-critic report.
---

# UI critic loop

Two roles, one loop:

| Role | Runs as | Reads | Writes |
|---|---|---|---|
| Critic | subagent (`models.critic`), brief in `critic.md` | our app + the references in the built-in browser, the previous report | `docs/ui-critic/round-NN.md`, screenshots in `docs/ui-critic/shots/round-NN/` |
| Fixer | subagent (`models.fixer`), brief in `fixer.md` | the latest report, `desk-design` skill, the code | code fixes, `docs/ui-critic/round-NN.fixes.md` |

Everything you may want to change is in **`config.json`** next to this file: `app.baseUrl`,
`references` (the two sites), `routes` (screens to visit, viewport, which reference to compare
with), `maxRounds`, `reportDir`, `models`. Change it there, not in these briefs.

## Before round 1

1. Read `config.json`.
2. Check the app answers: `curl -s -o /dev/null -w '%{http_code}' <baseUrl>/coordinator`. If not 200,
   start it with `preview_start {name: app.launchName}` and use that port as `baseUrl` for this run.
   The pages are ungated only on this laptop with `DEMO_MODE=1` (see `lib/localDemo.ts`).
   **One dev server per checkout.** Two `next dev` processes in the same folder share `.next` and
   delete each other's page scripts: pages render but never hydrate (buttons dead, scripts 404).
   Before a round, `lsof -iTCP -sTCP:LISTEN | grep node` and check page scripts return 200. If they
   404, stop the extra server and restart the one you use after moving `.next` aside.
3. Find the last round: the highest `reportDir/round-NN.md`. The next round is NN+1. A request to
   "continue" or "fix the report" starts from that file; do not redo a round that already exists.

## The loop

```
round = next round number
loop:
  critic(round)                 -> round-NN.md   (diffs against round-(NN-1).md if it exists)
  if report has 0 high findings -> stop: "done"
  if round == start + maxRounds - 1 -> stop: "round limit"
  if the user asked for critic only -> stop
  fixer(round)                  -> code edits + round-NN.fixes.md
  round += 1
```

- Start the critic with the Agent tool: prompt = the full text of `critic.md` + the values for this
  round (round number, baseUrl, the routes and references from config, path of the previous report).
  The critic needs the built-in browser tools (`mcp__Claude_Browser__*`). If the subagent reports it
  has no browser tools, run `critic.md` yourself in this session.
- Start the fixer the same way with `fixer.md` + the report path. Fixer runs only after the critic
  is done (they never run at the same time: the fixer changes what the critic is looking at).
- After each critic round, tell the user in 2–3 lines: counts by severity, what changed since last
  round, the report path. After the fixer, list fixed / skipped findings and the changed files.

## Rules for the whole loop

- **Shared checkout.** Other sessions edit `components/` at the same time. The fixer never touches a
  file that already has uncommitted edits it did not make; it marks the finding `blocked: file busy`
  and moves on. The user can then say to fix those anyway.
- **No commits by default.** The loop leaves fixes uncommitted and lists the files. Commit only when
  the user asks, only the loop's own files, tied to the GitHub issue for this work (see CLAUDE.md).
- **Design system wins.** Every fix follows `.claude/skills/desk-design/SKILL.md` (tokens only, words
  rules, icons). A reference site is an example of *what* to show, never of colours or fonts to copy.
- **Demo first.** Severity is about the two-minute demo (`docs/demo.md`): something broken or
  unreadable on a demo screen is high; a weaker look than the reference is medium; polish is low.
- Reports, notes and code are in English.

## Files

- `config.json` — routes, references, round limit, models.
- `critic.md` — the critic's brief: how to walk screens, what to compare, finding format, diff rules.
- `fixer.md` — the fixer's brief: order, file-busy rule, checks to run, fix log format.
- `report-template.md` — the exact shape of `round-NN.md`.
- `docs/ui-critic/references.md` — the candidate reference sites and why these two were picked.

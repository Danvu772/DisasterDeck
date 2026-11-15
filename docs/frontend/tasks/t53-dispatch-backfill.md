---
id: t53-dispatch-backfill
effort: high
checkpoint: role1-takeover
files: new scripts/dispatch-backfill.ts, workers/dispatcher.ts (export a helper only if needed), package.json (one script line)
---
# Give every demo user their tasks back: a one-time dispatcher backfill

Dan: "get each demo user and agent type their tasks back." The screens read the live desk (`DESK_ID=malatya-2023`), which has 4 sites, 2 roads, 3 shelters and **0 tasks**. The sites arrived before the dispatcher existed (t37, `803320b`), and the dispatcher only reacts to changes, so nothing ever created their tasks. Dan took over Role 1 (tracker #26), so this task may add the files above. Read `workers/dispatcher.ts` (`react(changes)`, the candidate rules, inbox writes), `workers/memory-keeper.ts` (the `Change` type, `postEvent` use), `workers/brain.ts`, `lib/db.ts` and `lib/keeper-check.ts` (how checks use a throwaway desk).

## Build `npm run dispatch:backfill` (`tsx --env-file=.env.local scripts/dispatch-backfill.ts`)
1. **Desk:** `process.env.DESK_ID`, and refuse to run when it is unset. Print the desk and what it will do first. `--dry-run` prints the plan and writes nothing.
2. **Retract the test record** (#31): any site whose history shows it was written by `db-check` (`history[].by === "db-check"`) gets a `correction` event with `action: "retract"`, posted through `postEvent` as `actor: "coordinator-duty"`, `source: "person"`, reason "Test record from db:check, not a real report (#31)". The Brain applies it (Darshal's correction handler, `e85ca71`).
3. **Backfill tasks:** for every open record on the desk, call the dispatcher's own logic exactly as if the record had just changed (build the same `Change` objects the keeper produces, and call `react(changes)`, or an exported helper that does the same). Never write tasks by hand. The rules decide: call tasks for `not_called` sites to the nearest available volunteer, rescue tasks `waiting_approval` for verified sites with people trapped, deliver tasks for open needs, inbox items for each.
4. **A need for the supplier:** with `--seed-need`, post one `need` event through `postEvent` as `actor: "field-alpha"`, `source: "person"`, payload 20 blankets, life-threatening true, at the site the field team is nearest to, `dedupeKey: "demo:need:blankets:1"` so a rerun never doubles it. The Brain turns it into a need and a deliver task.
5. **Idempotent:** running it twice changes nothing the second time (the `one_open_task` index, dedupe keys). Print a summary: tasks created per assignee, events posted, records skipped and why.
6. Never touch any desk except `DESK_ID`. Never delete documents.

## Check
Run it against a throwaway desk first: copy the 4 sites and 3 shelters of `malatya-2023` into `check-backfill`, run the script with `DESK_ID=check-backfill`, assert call tasks exist for each not-called site with an assignee and an inbox item, run it a second time and assert nothing new, then delete the `check-backfill` documents. Then run `--dry-run` against `malatya-2023` and paste the plan into your report. **Do not run it for real against `malatya-2023`**: the orchestrator does that after review.

Accept when: tsc, eslint pass, the throwaway run passes twice, and the dry run's plan is in the report.

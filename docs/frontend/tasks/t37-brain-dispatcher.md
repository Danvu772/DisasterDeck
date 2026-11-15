---
id: t37-brain-dispatcher
effort: high
checkpoint: role1-takeover
files: workers/brain.ts, workers/memory-keeper.ts, workers/dispatcher.ts, workers/sweeper.ts, lib/rules/*, lib/keeper-check.ts
---
# The Brain handles every event a person sends, and the dispatcher makes tasks (closes #8, fills #3 to #7)

Dan took over Role 1's blocking items (tracker #26). This task may edit the Role 1 files listed above. Build on Darshal's Brain (`76427c5`): one loop, the lease, the keeper as the only writer of records, the dispatcher as the only writer of tasks and inboxes. Read `workers/brain.ts`, `workers/memory-keeper.ts`, `workers/dispatcher.ts`, `workers/sweeper.ts`, `lib/rules/`, `lib/keeper-check.ts`, and `docs/Multiplayer Disaster Desk/Final system design.md` §4 (lifecycles), §5 (how the dispatcher decides), §6 (help desk) first.

## The bug this fixes
The Brain only takes events whose type is in `HANDLED` (memory-keeper), which is `report` only. Every `answer`, `approval`, `incident`, `need`, `claim` a person posts stays `pending` forever, and there are no tasks at all (the dispatcher is a stub), so every task button on every screen answers 404.

## Build
Your gap session already wrote these rules on `origin/p-003-keeper` (`lib/rules/keep.ts`, `assign.ts`, `priority.ts`, `keep.test.ts`, the worker). It conflicts with Darshal's keeper now. Read it with `git show origin/p-003-keeper:<path>` and port the rules into Darshal's structure, do not paste the old worker over his.

1. **Dispatcher (#8):** in `react(changes)`:
   - A new or changed site with `callStatus: "not_called"` and no open call task: a `call` task, low risk, assigned straight to the nearest available volunteer (role volunteer, status available, seen in the last 3 min if `lastSeen` exists, fewer than 3 open tasks, not in `tried`). No candidate: `escalated` with the reason.
   - A site that becomes `verified` and still has people trapped, no open rescue task: a `rescue` task, high risk, `waiting_approval`, with the proposed field team named in `detail`.
   - An open need with no open deliver task: a `deliver` task, low risk, to the nearest supplier whose `profile.stock` has the item.
   - Every created or reassigned task writes one `InboxItem` for its assignee (`kind: "task"`), and approvals write one per coordinator (`kind: "approval"`).
   - Respect the `one_open_task` unique index (one open task per record and type).
2. **New event types the Brain takes**, each applied in one place and marked done, merged or rejected with a reason:
   - `answer`: `accepted` (with `etaMinutes`, and `progress` `en_route` or `arrived`, #7), `declined` (next person, never the same one twice, escalate after 3), `done` (task done, site or need moves on). `arrived` moves the site to `team_on_site` (decision D7).
   - `approval`: approved assigns the proposed team, or the `assignee` named in the approval (Modify, #3). Rejected cancels the task. Only for tasks in `waiting_approval`, otherwise rejected with a reason.
   - `incident` (help desk, §6): opens or updates an incident, blocks the task when `canContinue` is false, creates the replacement task for the next candidate.
   - `need` and `claim`, at least: create or merge the record, so they stop piling up as pending.
3. **Keeper fills the v2.2 fields** (merged in `f235d43`): `scoreParts` written next to every `priority` (#4), so the parts add up to the score. `caseNo` given once at creation, a per-desk counter in the `meta` collection (#5). `posts` on sites, the latest 5, masked like the feed (#6). `supporters`, and `support` as its length.
4. `lib/keeper-check.ts`: extend it to cover a report becoming a site and a call task, an accept, an arrived, a done, an approval with an assignee, an incident that blocks a task. It writes only to its throwaway desk. It must pass.

## Careful
- The Brain is running right now on Dan's laptop against the shared Atlas cluster (`npm run brain` in another session). Do not run it yourself. `keeper:check` uses a throwaway desk, that is fine.
- Never write to the real desk `malatya-2023` from a check.

Accept when: `npm run keeper:check` passes with the new cases, `npx tsc --noEmit` passes, and the commit message says `Closes #8` and names #3 to #7.

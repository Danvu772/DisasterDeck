# Review: closing the gap between Final system design and the Brain

Branch `gap/final-design`, five commits on top of local main `e70ec2c`. Worktree at `~/Desktop/HACKTHENEST-orchestra/wt/gap-final-design`. Nothing is pushed, no GitHub issue was opened, claimed or commented on. Your main checkout was not touched (it is still in the middle of merging `origin/main`, with conflicts in `components/AgentDesk.tsx` and `components/Nav.tsx`).

Read this top to bottom, leave a line under any `> Dan:` you disagree with, then merge (last section).

## Background

The vault note `Final system design.md` (v2) is the spec. Three read-only audits walked it row by row against the code. The full gap list with sizes and owners is in [task-list.md](task-list.md). The OpenAI and Exa rows are gone because the track dropped both rules on 14 Nov.

The Brain was further along than `docs/TASK-LIST.md` says. All 11 event types are handled, the loop is the §10 one-loop shape, and the queue rules (lanes, locks, attempts, dedupe, the one-open-task index) all hold. What was missing sat in three places: the timer half of the sweeper, the coordinator override on priority, and lifecycle edges where a task or an incident could get stuck forever.

This branch only touches lane 1 (`lib/`, `workers/brain|memory-keeper|dispatcher|sweeper.ts`, one `lib/openapi.ts` entry, one `package.json` script). No screens, no agents, no data.

- 17 files, +901 / -73
- 18 gaps from the task list built (T1 to T18), plus one bug found on the way (T19)
- new check `npm run gap:check`, 24 assertions, every one tied to a T number
- every existing check still passes (numbers at the bottom)

## Decisions I made for you. Each one is one line to revert.

These are the calls the spec did not fully settle. I picked what the spec text implies and wrote down how to undo it.

**D1. A person who never opened the app gets no tasks (R1-1).** `lib/rules/assign.ts` used to let a missing `lastSeen` pass "seen in the last 3 minutes". That is how three call tasks escalated on malatya-2023 overnight: they went to seeded people who never logged in, timed out, and escalated. Now never seen counts as not seen. What this means for the demo is that every role screen has to be open (the inbox poll stamps `lastSeen`) before its person gets work. Until then, tasks escalate and `redelegate()` hands them out the moment someone shows up. Revert: `!u.lastSeen ||` back to `u.lastSeen &&` in `pickPerson`.

> Dan:

**D2. A pin is ±500 inside the tier.** §5 says a coordinator can pin an item to the top or push it down, with the reason on the record. It does not say whether a pin can beat a tier. I kept "tier always wins": the pin is a score part of +500 or -500, which is bigger than anything the rules reach (50 + 60 + 30 + 20), so it decides inside the tier and never across. It rides on the existing `correction` event: `{ action: "edit", recordType, recordId, fields: { pin: "top" | "down" | null }, reason }`, coordinator only. No new event type, no schema change. Revert or retune: `PIN` in `lib/rules/priority.ts`.

> Dan:

**D3. Citizens cannot retract or edit.** Before this, any person, a `public` citizen included, could retract a site and cancel its rescue. §5 says a public voice alone never cancels anything. Now a citizen's retract or edit is rejected with a reason ("needs a volunteer, a field team or a coordinator to check it first"). One exception: a citizen can withdraw a need that only they asked for. Revert: the block under "a public voice alone never" in `applyCorrection`.

> Dan:

**D4. Solved, non-critical problems get no coordinator card.** §6 says a card for "everything critical and everything the rules could not solve". The code sent one for every incident. Now it is critical, escalated, or `unreachable` (that playbook row says "always told"). The incident is still on the board either way. The scenario's truck breakdown still gets its card, because its blankets are life-threatening, so the incident is critical. Revert: the early `return` at the top of the card block in `incidentOpened`.

> Dan:

**D5. Comfort items are a regex.** Tier 2 never existed, so hot meals sat in tier 1 next to water. `needTier()` in `lib/rules/needs.ts` puts hot meals, burgers, snacks, coffee, tea, chargers, power banks, toys and books (plus a few Turkish words) in tier 2. Water, food, medicine and warmth stay tier 1. Is a regex really the right tool? For a weekend, yes. The honest version is a `comfort` flag on `NeedPayload` that the agent sets, which is Role 2's tool.

> Dan:

**D6. M = 10 min.** The spec's sweeper row "accepted, no word for M minutes" never names M. I used 10, overridable with `SILENT_MINUTES`. `ANSWER_MINUTES` (N) now reads from env too, default 2, so an unattended run can use 10 (R1-2).

> Dan:

## What changed, by gap

Each row says what the code does now and which `gap:check` line proves it. Line numbers are on the branch.

### The sweeper table (§5), `workers/sweeper.ts`

The spec has seven timer rows. Main had three. All seven run now, every one is a conditional update or a keyed inbox item, so a second tick or a second Brain does nothing twice.

| ID | Row | Where |
|---|---|---|
| T1 | An approval nobody answered by its deadline is marked `overdue`, gets a new deadline, and is sent to every coordinator again. Each coordinator keeps one live approval card (the old one is marked read). The desk never approves by itself. Deciding it clears `overdue` | `approvalLate` dispatcher.ts:270 |
| T2 | A shelter number older than 30 min: its keepers get "Is X still 40/60? That number is 45 min old". Once per reported number | `askShelterConfirm` :292 |
| T3 | A closed road still `unconfirmed` after 20 min: the nearest free field team gets "Can you check X?". Once per report | `askRoadConfirm` :301 |
| T4 | A person not seen for 3 min loses their unanswered tasks now, not at the deadline. Their `users.status` is not written (the API owns users) | `offlineTimedOut` :260 |
| T5 | An accepted task with no ETA and no word from its person for M min gets a check-in. Any new answer now clears the check-in, so "still on it" without an ETA no longer turns into a false `unreachable` | `checkIn(..., "silent")` |
| T6 | A `proposed` need nobody else asked for in 2 h is cancelled, and the people who asked hear why | `expireProposed` memory-keeper.ts:1213 |

### Priority (§5)

T7 is the coordinator pin (D2). The reason goes into the record's history as "pinned to the top of tier 0 by coordinator-duty: family called the desk twice", the open task copies the new priority, and the waiting recount keeps the pin.

T19 is a bug I found while wiring T7, and it is the one I would point at first. On main, a report that merged into a site recomputed the score from support and waiting only. A silent-zone site lost its +30 the moment a second tweet arrived, and a repeat need dropped its cold-night +20 the same way. §5 says satellite data only ever raises a score, and here it was being quietly taken away (on the exact sites the NASA pitch is about lmao). `kept()` in `lib/rules/priority.ts:41` now carries both satellite terms and the pin through every recount. I checked it: putting the old line back makes `gap:check` fail on "the satellite term is still there".

### Task and incident lifecycle (§4, §6), `workers/dispatcher.ts`

| ID | What it does now |
|---|---|
| T8 | A report or a correction that changes trapped count, hazard, address or position tells everyone with an open task on that site (or on a need for it): "Update on site 57: 3 trapped now". Not the person who said it. Incident hazards are skipped here, because the playbook already sends its own warning. `tellSiteWorkers` :676 |
| T9 | A blocked task used to stay blocked forever. When its incident resolves: if a replacement is moving, the original is `cancelled`. If nobody took over, the same person carries on (`accepted`, open again), the escalated replacement is cancelled, and a delivery's need goes back to `on_the_way`. If the one-open-task index says another task already does this work, the original closes. `unblock` :598 |
| T10 | A coordinator can name the person for an `escalated` task (an approval event with `assignee`). Without a name it is refused. Before, `applyApproval` refused anything not in `waiting_approval`. `DECIDES` :332 |
| T11 | A `handover` blocks and replaces every open task of the person, not only the one named, and the replacement's detail carries "Handover note from X: ...". memory-keeper.ts:527 |
| T12 | A delivery needs stock and a vehicle (§5 line 2). The seeded suppliers have trucks, so the demo is unaffected |
| T13 | Coordinator card gating (D4) |

### Trust, tier, confidence (§5)

| ID | What it does now |
|---|---|
| T14 | Tier 2 exists (D5) |
| T15 | Roads can be `corroborated`: three different public voices saying the same thing, the same rule as sites (`publicVoicesOn` memory-keeper.ts:757). The trusted-clash rule (two trusted sources disagree within 10 min, ask to confirm) only existed for shelters. Roads have it now: the nearest free field team is asked, or the coordinators when nobody is free (`roadClash` dispatcher.ts:998) |
| T16 | Citizen corrections (D3) |
| T17 | §5: "anyone, danger to life: never waits. A volunteer gets a call task to verify it right away". The life-threatening need from a citizen already opened at once. Now it also gets a call task to a volunteer, and "done" on that call marks the need `confirmed`. The delivery does not wait for the call |
| T18 | D1 and D6 |

## Other things I found

- **`api:check` was failing on main.** `/api/chat` grew a `GET` (the voice yes/no) that `lib/openapi.ts` did not describe. I added the entry, since the spec file is lane 1.
- **The desk id split (R1-5) bites the checks.** Your `.env.local` says `DESK_ID=malatya-2023`, while `data/seed.json` and the `lib/db.ts` default say `antakya-2023`. `api:check` only passes with `DESK_ID=antakya-2023`. It is still your call which one wins.
- **`keeper:check` had a timing flake.** It assumed no two events land within a millisecond of each other, and failed about 1 run in 4. It counts what the cursor should return now.
- **Check fixtures had no `lastSeen` and no vehicles.** After D1 and T12 they need a heartbeat and trucks. The sweeper check moves its clock forward by hours, so its people are seen "in the future". That is a little ugly, but it is honest about what the fixture means.
- **Seed shelters are stamped Feb 2023 (#30).** With T2 on, the first sweeper tick asks shelter-desk "Is X still N/M? That number is 1373 days old". That is correct behaviour on bad data, and also a funny thing for a judge to see. Refresh the seed clocks (Role 4) before the demo, or expect that notice.

> Dan:

## Not built, and why

These are in [task-list.md](task-list.md) as O1 to O12. The short version:

- **Other lanes**: x-agent `observedAt` (Role 2), seed trust and clocks (Role 4), `users.coords` from a live position (Role 2, `/api/chat`), ask_desk citizen scope (Role 2).
- **Cut list in the spec**: Instagram and Facebook agents, the evacuation planner, split and merge corrections, role requests.
- **Screens (Role 3, yours, but main has an unfinished UI merge)**: nothing reads `task.overdue`, `site.pin` or `need.pin` yet. The board needs a red late-approval state, a pin control for coordinators (it posts the correction in D2), and an incidents column. The API already serves all three fields through `getBoard()`.
- **Already on a branch**: #36, the synthetic feed writing "address unknown" sites, is `fe/t61-feed-no-unknown-sites`.

### Decisions only you (or the team) can make

These are `decision`-shaped, so I put the options here and stopped.

1. **Citizens offering help (O9).** §9 says a citizen can "offer help", but `declare_work` refuses `public`. Option A: allow a `claim` from public as a proposed task that a coordinator confirms. Option B: leave it out and say so in the pitch.
2. **Full phone number in the caller's task detail, plus view logging (O11).** §10 promises both. The code masks everywhere and never stores a full number. Every demo number is fake, so this is about whether the pitch can claim it.
3. **Agent key impersonation (O12).** An `x-agent-key` caller can set `actor` to any user id, a coordinator's included. The scenario player relies on that. Option A: restrict agent actors to agent names and give the player its own path. Option B: keep it and name it as a known limit.
4. **R1-5 desk id** (see above) and **R1-6** (`users.status` is written by the keeper, and the contract says only the API writes users).

### Issues to open, if you want them tracked

Per `CLAUDE.md` this work should hang off issues. I did not create any, because that is visible to the team and you were away. If you want them:

- "Brain: sweeper timer rows, pin, lifecycle edges (gap/final-design)", `role:1-backend`, body = the task-list link. Covers R1-1 and R1-2 from `docs/TASK-LIST.md`.
- "Board: late approvals, pin control, incidents column", `role:3-frontend`, depends on the above.
- One `decision` issue each for 1 to 3 above.

## How it was tested

Everything ran against a throwaway MongoDB 7 in Docker (`gapdesk-mongo`, port 27027), never against Atlas. The worktree has its own gitignored `.env.local` pointing there, with a throwaway `AGENT_KEY`. The shared desk was never read or written.

| Check | Result |
|---|---|
| `gap:check` (new) | 24 passed |
| `keeper:check` | 23 passed, 5 of 5 runs |
| `handlers:check` | 24 passed |
| `dispatch:check` | 16 passed |
| `helpdesk:check` | 14 passed |
| `sweeper:check` | 8 passed |
| `reconcile:check`, `top:check` | 4 and 4 passed |
| `api:check` (`DESK_ID=antakya-2023`) | 35 passed |
| `security:check`, `load:check`, `db:check`, `check:contract`, `check:pilot` | passed |
| scenario player, satellite watcher, real replay tests | 29 passed, 0 failed |
| `tsc --noEmit`, `eslint lib workers`, `next build` | clean |

Not tested: a live run on the shared Atlas desk with four browsers. That is the real acceptance test, and it is yours to run at rehearsal.

To re-run locally: `docker start gapdesk-mongo`, then `npm run gap:check` (and the others) from the worktree.

## How to merge

1. Finish the merge already open in `~/Desktop/HACKTHENEST` (the AgentDesk and Nav conflicts).
2. `git merge gap/final-design`. A dry run with `git merge-tree` against both local main and `origin/main` shows no conflicts in any file this branch touches.
3. Delete `review/` before or after, it is only for this review.
4. Before rehearsal: restart the Brain (it is one process holding a lease, so stop the old one first), then open every role screen, because of D1.
5. Cleanup when done: `git worktree remove ~/Desktop/HACKTHENEST-orchestra/wt/gap-final-design` and `docker rm -f gapdesk-mongo`.

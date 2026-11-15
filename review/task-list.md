# Task list: Final system design vs the code on main

Source of truth is the vault note `Final system design.md` (v2, 14 Nov) plus `Team contracts.md`. The code is main at `e70ec2c`. Three read-only audits walked every row of §2 to §10 against `workers/`, `lib/`, `agents/`, `app/api/` and the screens. The model and Exa rows are dropped: the track lifted both rules on 14 Nov (Discord, Karthiktron), so Claude and Claude web search are fine.

The short version: the Brain is much further along than the old docs say. All 11 event types are handled, the one-loop shape matches §10, the queue rules all hold, and the playbook has every row. What is missing is the timer half of the sweeper, the coordinator override on priority, and a handful of lifecycle edges where a task or incident can get stuck.

## Lane 1: Brain (Role 1, Dan since the 15 Nov handoff). The agent builds these.

| ID | Gap (spec ref) | Size |
|---|---|---|
| T1 | Approval waits past N min: nothing re-sends it or marks it late (§5 Approvals, sweeper row 7) | S |
| T2 | Shelter number older than 30 min: no "please confirm" (sweeper row 5) | S |
| T3 | Road unconfirmed for 20 min: nobody asked to check it (sweeper row 6) | S |
| T4 | Person not seen for 3 min: their unanswered tasks ride out the full deadline (sweeper row 3) | S |
| T5 | Accepted task with no ETA never gets a check-in, only ETA-based ones do (sweeper row 2) | S |
| T6 | A `proposed` need never cancels after 2 h quiet (§4 need lifecycle) | S |
| T7 | No coordinator pin or push-down with a logged reason (§5 Priority, decision 12) | M |
| T8 | A site update does not tell the people already working that site (§5 flowchart, first box) | S |
| T9 | A blocked task never resumes and never cancels (§4 task lifecycle) | S |
| T10 | A coordinator cannot pick someone for an escalated task (§4 `escalated → assigned`) | S |
| T11 | `handover` moves only the named task, the spec says all their open tasks (§6) | S |
| T12 | Deliver picking ignores "and a vehicle" (§5 Picking a person, line 2) | S |
| T13 | Incident card goes to coordinators for every incident, spec says critical or unsolved only (§6) | S |
| T14 | Tier 2 (comfort) is never assigned (§5 tier table) | S |
| T15 | Roads have no corroborated path, and the trusted-clash confirm only exists for shelters (§5 Trust) | S |
| T16 | A public citizen can retract a site or cancel a need via `correction` (§5 "a social post alone can never cancel") | S |
| T17 | A life-threatening need from a public person skips the verify call (§5 "danger to life never waits") | S |
| T18 | R1-1: a user with no `lastSeen` passes "seen in 3 min". R1-2: `ANSWER_MINUTES` from env (handoff) | S |

## Not in lane 1. Listed, not built.

| ID | Gap | Owner | Why not built here |
|---|---|---|---|
| O1 | Instagram and Facebook agents (§2, flow 8.4) | Role 2 | Cut list #1. Photo to capacity already works through a person's chat |
| O2 | Evacuation planner, Lahaina scene (§2, flow 8.3) | Role 1 + 4 | Cut list #2. The approval path for `plan` events exists and is tested |
| O3 | `x-agent` stamps `observedAt` = now on synthetic replay (A10) | Role 2 | Not my folder |
| O4 | Seed shelters have no `trust`, seed clocks are Feb 2023 (#30, R1-7) | Role 4 | `data/` is Role 4 |
| O5 | `synthetic-feed.ts` writes junk sites to the live desk (#36) | Role 1 | Already on branch `fe/t61-feed-no-unknown-sites` |
| O6 | Incidents column, pin control, late-approval red on the board | Role 3 | Main has an in-progress UI merge with conflicts. The API fields ship here, the UI waits |
| O7 | `users.coords` never updated from a live position | Role 2 (`/api/chat`) | Not my folder |
| O8 | ask_desk citizen scope slightly wider than spec | Role 2 | Not my folder |
| O9 | Citizens cannot "offer help" (`declare_work` refuses public) | Role 2 | Needs a decision, see the review doc |
| O10 | Split and merge corrections, role request flow | Role 1 | Cut list #3 |
| O11 | Full phone number in the caller's task detail, view logging (§10 Privacy) | Role 1 | Every number is fake. Decision, see the review doc |
| O12 | Agent key can set `actor` to any user id | Role 1 | Scenario player relies on it. Decision |

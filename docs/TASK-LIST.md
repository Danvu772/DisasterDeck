# Task list: original system vs current state

Basis: the original is `docs/Multiplayer Disaster Desk/` (idea, Final system design, hackathon packet). The current state comes from `docs/completion-plan.md`, `agents/TODO.md`, `docs/frontend/TASKS.md`, `docs/nasa-requirements-audit.md`, `api_front_back_gap/ROLE1-HANDOFF.md`, and grep checks on the code. The app was not run for this list, so "unverified" means a doc or grep hit only.

Role 1 (Backend and Brain) moved from Darshal to Dan on 15 Nov. Darshal's handoff is in `api_front_back_gap/ROLE1-HANDOFF.md`.

Goals:
- G1 Track rules: OpenAI models and Exa (Future of Intelligence), NASA data central, natural SSOJet login, MongoDB Atlas.
- G2 Shared memory and dispatcher: tasks go to people, approvals stay with the coordinator, agents never write records.
- G3 Personal agents per role: chat, task buttons, Problem reports, voice.
- G4 Research agents: X, news, sheets, NASA zones with silent-zone and cold flags.
- G5 Flows 8.1 to 8.7. 8.1 and 8.2 are must-work for the demo.
- G6 Map, board and phone views for each role.
- G7 Lahaina scene: Instagram, Facebook, evacuation routing.
- G8 Pitch: video under 3 minutes, Devpost, public repo, NASA credit line, honest limits.

Columns: ID, task, goal, status, done when.

## Role 1: Backend and Brain (Dan)

| ID | Task | Goal | Status | Done when |
|---|---|---|---|---|
| B1 | Keeper handlers for closure, capacity, alert, correction | G4, G2 | Built (e85ca71). Checked by `handlers:check` | A NASA cold event changes a task's priority on the shared board |
| B2 | Retry-safe dispatch: event marked final before the dispatcher runs | G2 | Open (completion plan) | A forced restart leaves no duplicate tasks or notices |
| B3 | Multi-operator callback, approval and incident flow on the shared deployment | G5 | Built, not tested live | Two browsers run flow 8.1 end to end |
| B4 | Score parts per record and case IDs (t04, t13) | G6 | Waiting on contract | Frontend shows real score parts and short case IDs |
| B5 | `GET /api/inbox`, `GET /api/users`, approve with another assignee (t05, t17) | G2, G6 | Open | Inbox badge and Modify both work |
| B6 | Shared Brain running with replayed data, one loop only | G2 | Lease-based loop built (76427c5). Coordination needed | One Brain process, shown in health output |
| B7 | Sweeper timers: no answer moves to next person, check-in to unreachable | G2 | Built (a84aa00). Checked by `sweeper:check` | Stale tasks move on without a click |
| B8 | Help-desk playbook: relay, assist, ETA notices, short supply, road blocked, unsafe | G5 | Built (7f3e212). Checked by `helpdesk:check` | A problem report produces a playbook step |
| B9 | Dispatcher gaps: need notices, stock check, approvals, assignee check, trust conflicts | G2 | Built (1459702, e85ca71). Checked by `dispatch:check` | Each rule has a passing check |
| B10 | Evacuation planner (routes, zones) | G7 | Evacuation approvals built. Planner not built | Decision: cut or build |
| B11 | Corrections that split or merge records | G2 | Retract and edit built. Split and merge not built | Decision: cut or build |
| B12 | Keep the desk-wide `reconcile()` and `redelegate()` working (e4c9206) | G2 | Built | Escalated tasks never come back |

### Role 1 tasks from Darshal's handoff (15 Nov)

| ID | Task | Goal | Status | Done when |
|---|---|---|---|---|
| R1-1 | Stop tasks escalating in an unattended demo. In `lib/rules/assign.ts` line 35, a user with no `lastSeen` passes the "seen recently" rule, so tasks go to people who never logged in. Treat a missing `lastSeen` as not seen, or stamp `lastSeen` on any screen open | G2, G5 | Open. 3 call tasks escalated on malatya-2023 at 08:19 to 08:21 UTC | A user last seen 75 min ago is not picked. A check covers it |
| R1-2 | Read `ANSWER_MINUTES` from the env (default 2) in `workers/dispatcher.ts` line 29, so unattended runs can use 10 | G2 | Open | `ANSWER_MINUTES=10` changes the deadline |
| R1-3 | Check scripts clean up the whole desk. Run `npm run db:reset -- --desk check-db` and clear leftovers (check-db: 2 sites, 2 tasks; check-api: 6 tasks) | G2 | Open | Checks leave no records on the live Brain's desk |
| R1-4 | Semantic knowledge search: `searchKnowledge(query, { role, desk })` in `lib/`, `GET /api/search` returning ranked records and posts with source, age and masked phones. Same role rules as `ask_desk` (a citizen sees only shelters and roads). Embed on write from the memory keeper. Atlas Vector Search index. Embeddings: OpenAI `text-embedding-3-small`, needs `OPENAI_API_KEY` | G1, G2 | Decided, not started | "Anyone reporting a gas smell?" returns a ranked post with its source |
| R1-5 | Pick one desk id. `lib/db.ts` defaults to `antakya-2023` and `data/seed.json` uses it. The live data and `.env.local` use `malatya-2023` | G8 | Decision needed | One id in code, seed and env |
| R1-6 | The Brain writes `users.status` (`setBusy`, `freePeople` in `workers/memory-keeper.ts`). Team contract says only the API writes users | G2 | Decision needed: keep or move | Contract and code agree |
| R1-7 | Seeded shelters have no `trust`, so they count as public and an Instagram or X update can overwrite them. Intended for flow 8.4, or add `trust` to the seed | G5 | Decision needed | Seed matches the intent |
| R1-8 | Optional: real 2023 tweets from `ctoraman/deprem-tweet-dataset` (about 1,000 labelled). Anonymise first, geocode ahead, then `workers/x-agent.ts --file`. About $6 | G4 | Optional, nothing imports it | Replay runs on real tweets, names and phones removed |
| R1-9 | Atlas access. The cluster is in Darshal's account. Ask for project access. `MONGODB_URI` and `AGENT_KEY` came privately | G1 | Open | Dan can open the Atlas UI |
| R1-10 | Network access is `0.0.0.0/0` for venue Wi-Fi. After the hackathon, delete the cluster to stop billing | G8 | Reminder | Cluster deleted after the event |

## Role 2: Agents (Göktürk, from Ömer)

| ID | Task | Goal | Status | Done when |
|---|---|---|---|---|
| A1 | OpenAI model in the agent stack. R1-4 puts OpenAI back in as embeddings only. Agents, photos and voice still run on Claude | G1 | Partly addressed by R1-4 | Decision made. At least one live agent path runs on OpenAI |
| A2 | Exa in the news agent, plus one real Exa call on demo day | G1 | News agent uses Exa | A logged live Exa call from the demo machine |
| A3 | Exa help-desk lookup | G5 | Not built. On the cut list | Decision: cut or build |
| A4 | Instagram and Facebook agents | G7 | Not built. Types and schemas only | Two demo posts produce events |
| A5 | Google Sheets sync | G4 | Built, tested both ways | Keep. Re-check before the demo |
| A6 | Hold-to-talk mic test on a laptop, and an HTTPS tunnel for the phone | G3 | Open | One real mic test passes |
| A7 | Photo input end to end | G3 | Chat accepts photos | One photo produces a filed event |
| A8 | Spend ceiling and keys for the demo | G8 | About $1 of $15 spent | `spend.ts` shows headroom after rehearsal |
| A9 | Truck breakdown flow (8.6) through the scenario player | G5 | Player exists. Unverified | Bonus demo runs once |
| A10 | `workers/x-agent.ts` stamps `observedAt` with now, not the tweet's time. Replays start every waiting time at zero | G4, G5 | Open (handoff) | Replayed tweets keep their own times |
| A11 | `agents/scripts/lib-check.ts` still mentions `npm run db:up`, which was removed | G8 | Open (handoff, small) | Script runs without the removed command |
| A12 | `ask_desk` gets a "search" option that calls R1-4's `GET /api/search`. Free-text questions stop failing | G3 | Waits on R1-4 | "What do we know about Turuncu Avlu?" answers from records |

## Role 3: Frontend (owner to confirm)

| ID | Task | Goal | Status | Done when |
|---|---|---|---|---|
| F1 | Fix SSOJet dashboard setup: callback, PKCE, client id and secret, `SSO_USER_MAP` | G1 | Rejected as `invalid_client` | Login lands on the role's screen |
| F2 | After login, open the screen for that role (t10) | G3 | Waits on F1 | Each role gets its own start screen |
| F3 | Shared board sorted by priority, incidents column | G6 | Board built. Incidents column unverified | Incidents appear in the column |
| F4 | Map: NASA zones with silent-zone and cold flags, evidence on click | G4, G8 | Zones on the map (partial) | Flags shown with their evidence |
| F5 | Agent-window map: pins drop in, zoom to the nearest, pulse the target | G6 | Designed, not started | Map answers animate once and point at the place |
| F6 | Phone view: approvals and Problem button | G3 | Done (t02, t07) | Keep |
| F7 | Lahaina feed entries from social agents | G7 | Waits on A4 | Entries appear in the feed |
| F8 | Four-device layout for scene 1 | G8 | Role views exist | Four browsers, four roles, one flow |

## Role 4: Data, NASA and pitch

| ID | Task | Goal | Status | Done when |
|---|---|---|---|---|
| N1 | NASA credit line on the project page | G8 | Not done | Line appears verbatim |
| N2 | Dataset, date, place and pixel size shown in the app | G8 | Evidence card exists. App unverified | Legend names each product |
| N3 | Cloud and gap handling stated on screen | G8 | Partly in docs | Stated next to the NASA layer |
| N4 | Second-dataset comparison (Antakya HOT/OSM) in the UI | G8 | Data packaged. UI unverified | Visible on the map |
| N5 | NASA-driven priority change shown live | G8 | Not shown | Demo step with before and after |
| N6 | Turkish tweets with English translation on screen | G8 | Planned | Judges see both |
| N7 | Scenario player and demo script rehearsed | G5 | Player exists | One full rehearsal |
| N8 | Devpost draft | G8 | Due 12:00 AM Sunday. Check whether filed | Draft filed |
| N9 | Public GitHub repo (admin action) | G8 | Open | Repo public before 12:00 |
| N10 | Demo video under 3 minutes | G8 | Old video exists | New cut uploaded |
| N11 | Track entries and an honest AI-tools list | G8 | Open | Matches what is built, including A1 |
| N12 | Label synthetic data (field, logistics, social posts) | G8 | Partly | Labels visible on screen |

## Cross-cutting

| ID | Task | Status |
|---|---|---|
| X1 | Feature freeze 08:00, code freeze 11:00, submission 12:00. Check the timezone | Dates from the packet |
| X2 | Secrets never in GitHub. Partner keys checked | Open |
| X3 | Contract, handler, dispatch, help-desk and e2e checks pass on the final branch | Partly run |
| X4 | Every teammate can explain any part of the code | Judges may ask |

## Decisions still open

1. A1: move at least one agent to OpenAI, or accept the track risk.
2. Cuts: keep or drop A3, A4, B10 and B11. The original cut list puts evacuation and social agents near the top.
3. Role 3 owner. The docs don't name one.
4. R1-5 desk id and R1-6 `users.status` ownership.
5. R1-7 seed trust for flow 8.4.

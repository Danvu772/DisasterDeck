# API gaps: what the frontend waits on, what the API lacks

> **Tracked on GitHub (15 Nov).** Every gap below is an issue: G-01 #19, G-02 #20, G-03 #1, G-04 #2, G-05 #3, G-06 #4, G-07 #5, G-08 #6, G-09 #7, G-10 #13, G-11 #21, G-12 #18, G-13 #22, D-01 #23, D-02 #25, D-03 #24, M-01 #25, M-02 #16, S-01 #11. Overview and checklist: #26 (pinned). Comment and close there. Keep this file as the detailed record, and say `Closes #N` in the commit that fixes a gap.

Measured on 14 Nov 2026 at repo commit `c6063da`. Commit `77e7752` landed after that and changes only docs, and commit `26f9c3f` changed `auth.ts` and login only, so the gaps below hold at the current head. The current state of each route is in [API.md](API.md). The decisions behind the status column are in [DECISIONS.md](DECISIONS.md).

Three facts explain most of the list.

The API has a write path and almost no read path. `POST /api/events` works. The GET routes that the board, the inbox, the health line, the person picker and the feed need return 404 or 405.

The read code already exists. `getBoard()`, `getUserContext()` and `getHealth()` in `lib/db.ts` do the work. No route called them, so every screen that polls the board showed fixtures and said so.

Nothing turned events into records. The Brain files that Team contracts §2 assigns to Role 1 did not exist. `markLoop()` had no caller. An approval, an answer or a problem report naming a task got `404 task not found`, because no task was ever created.

## Status after the 14 Nov grill

Status is one of: `on main` (merged; `on main (Role 1)` means Role 1 built it in its own folders), `proposed` (code on a branch, waiting for Role 1's approval), `open` (no proposal yet), or `deferred` (decided not to build yet).

| ID | Gap | Owner | Status | Where |
|---|---|---|---|---|
| G-01 | Brain loop not in the repo | Role 1 | on main (Role 1) | `npm run brain`: one loop with a lease (one Brain per database), memory keeper for `report` → sites, sweeper for stuck events. Dispatcher is a stub until CP2. P-003's keeper is superseded |
| G-02 | `GET /api/board` missing | Role 1 | on main (Role 1) | Open when `DEMO_MODE=1` (screens poll without `?user=`), otherwise session, demo user or agent key. Differs from D2, decided by Role 1 |
| G-03 | `GET /api/inbox` missing | Role 1 | proposed | P-001 (adds `POST /api/inbox` to mark read, so the badge can clear) |
| G-04 | `GET /api/users` missing | Role 1 | proposed | P-001 (no `public` role) |
| G-05 | Approval cannot name another assignee | Role 1, Role 3 | proposed | P-002 adds the field, P-003 applies it. Modify stays unwired until P-003 merges |
| G-06 | No priority breakdown | Role 1 | proposed | P-002 adds `scoreParts`, P-003 fills it |
| G-07 | No short case number | Role 1 | proposed | P-002 adds `caseNo`, P-003 assigns it |
| G-08 | Post text not on the board | Role 1, Role 3 | proposed | P-002 (contract and `BoardCards`), P-003 (masked write) |
| G-09 | "On our way" and "arrived" have no state | Role 1, Role 3 | proposed | P-002 (contract and `FieldPhone`), P-003 (applies it, site to `team_on_site`) |
| G-10 | Hold to talk sends audio | Role 3 | on main | Web Speech API, text to `/api/chat`. Needs one test on a phone over HTTPS |
| G-11 | `GET /api/events?since=` missing | Role 1 | on main (Role 1) | Phones masked on the way out. Shows the whole desk ("Desk feed · everyone"), not only the caller's events: decided by Role 1 |
| G-12 | Users have no email | Roles 1 and 3 | deferred | D6: `SSO_USER_MAP` is enough for the demo |
| G-13 | `GET /api/health` missing | Role 1 | on main (Role 1) | Open, counts only. `lastLoopAt` shows whether the Brain runs |
| D-01 | Read routes not in the spec | Role 1 | on main (Role 1) | Board, health and the feed are in `/api/docs`. Inbox and users follow with their routes |
| D-02 | `fixtures/` had no owner | Both | on main | `owners.json`: Role 3. `quake-watcher.ts` still has no owner, see Notes |
| D-03 | `api:check` writes to a shared database | Role 1 | on main (Role 1) | `api:check` and `keeper:check` write only to throwaway desks (`check-api`, `check-cp1`) and delete them, so the shared board never shows test data |
| S-01 | `DEMO_MODE=1` on a public tunnel | Roles 1 and 3 | open | D5: tunnel only in supervised runs. The `?user=` path is still open to anyone who reaches the server, see DECISIONS |
| M-01 | Frontend notes said `requestedBy` was missing | Role 3 | on main | comments fixed, `MyNeed` is the contract type |
| M-02 | Role 1 doc differs between repo and vault | Role 4 | open | `docs/` belongs to Role 4 in Team contracts §2 |

## Register

Owner is the role that makes the fix. Notes give the detail that did not fit in the status table.

| ID | Gap | Blocks | Severity | Notes |
|---|---|---|---|---|
| G-01 | The Brain loop is not in the repo: keeper, dispatcher, sweeper, `lib/rules/` | Every live screen, all approvals and tasks | critical | Sweeper is not in P-003. Keeper and dispatcher share one loop for now |
| G-02 | `GET /api/board` does not exist | Live mode on `/`, `/map`, `/coordinator`, `/field`, and the scenario player | critical | `getBoard()` already returns the full shape. The scenario player calls it with the agent key and `deskId` |
| G-03 | `GET /api/inbox` does not exist | Inbox badge (t05) | high | Without a way to mark read, the badge never clears |
| G-04 | `GET /api/users` does not exist | Coordinator's person picker, Modify (t17), the people list | high | Public role gets 403 (D4) |
| G-05 | An approval cannot name another assignee | Modify (t17) | high | Needs a types and schemas change |
| G-06 | Records carry no priority breakdown | Priority breakdown on click (t04) | medium | Score parts come from the rules in P-003 |
| G-07 | Records have no short case number | Case IDs on cards, replies and the phone (t13) | medium | Keeper assigns it at creation |
| G-08 | Post text is not on the board | "English translation under every tweet" | high | Posts are masked before storage (D3) |
| G-09 | "On our way" and "arrived" have no task state | Field phone buttons | high | D7 |
| G-10 | Hold to talk sends audio, the route wants text | Voice on `/field` and `/agent` (t18) | high | Fixed on main. Not tested on a real phone yet |
| G-11 | `GET /api/events?since=` does not exist | The left column of `/agent` | medium | Caller sees their own events and events on their tasks. Output masked |
| G-12 | Users have no email, so login maps emails by env var | Real role at sign-in (t10) | medium | Deferred (D6) |
| G-13 | `GET /api/health` does not exist | Nothing yet. The board carries the same health | low | Kept (default). Simple to drop later |
| D-01 | Read routes are not in the spec yet | Swagger UI | low | `npm run api:check` fails until each route has its entry |
| D-02 | `fixtures/` and `workers/quake-watcher.ts` have no owner | Approval rule has a hole | low | `fixtures/` is Role 3 now. `quake-watcher.ts` still needs an owner. Check `git log` |
| D-03 | `api:check` writes to whatever `MONGODB_URI` points at | Shared database safety | medium | `.env.local` points at the shared Atlas cluster |
| S-01 | `DEMO_MODE=1` on a public tunnel lets anyone act as a seeded user | Approvals, if the tunnel is public | high | D5 is the rule for the demo. The code is unchanged |
| M-01 | Frontend notes said `requestedBy` is not in the contract | Nothing. Misleads readers | low | Fixed on main |
| M-02 | Role 1 doc in the repo and in the vault disagree | Nothing. Misleads readers | low | Role 4 owns `docs/` |

## Details

### G-01: The Brain loop is not in the repo

Events have to become sites, needs, roads and tasks before the board, the approvals and the task buttons mean anything. P-003 adds the keeper and dispatcher. It is pure rules in `lib/rules/`, with a test file, and a worker that does the database I/O. The rules run on the whole desk's records on each event. That is fine at demo size and is a known limit for later.

### G-02: `GET /api/board` does not exist

P-001 adds the route. It takes `?deskId=`, which the scenario player sends. The gate is D2: a session, a demo user, or the agent key.

### G-03 and G-11: the inbox and the feed

P-001 adds `GET /api/inbox` (unread, newest first, sets `lastSeen`) and `POST /api/inbox` (marks the listed ids read, or all of them). The feed, `GET /api/events`, returns the caller's own events and the events on the caller's tasks. Text fields are masked on the way out. The stored event is not changed (see D3).

### G-04: `GET /api/users`

Returns `_id`, `name`, `role`, `region` and `status`. Never `profile`. Citizens get 403 (D4).

### G-05: An approval cannot name another assignee

P-002 adds `assignee?: string` to `ApprovalPayload` in `lib/types.ts` and `lib/schemas.ts`. P-003 applies it: the named user must exist, the task is reassigned, and the status becomes `assigned`. Until P-003 merges, the field is accepted but ignored. That is why the Modify button stays unwired on main. Wiring it earlier would make Modify approve the task without changing the assignee, and nothing would say so.

### G-06, G-07, G-08, G-09: the record fields

P-002 adds, all optional: `Site.posts`, `Site.supporters`, `Site.scoreParts`, `Site.caseNo`, `Need.scoreParts`, `Need.caseNo`, `Incident.caseNo`, `Task.scoreParts`, `Task.progress`, `AnswerPayload.progress` (only with `result: "accepted"`), and the `assignee` field above. The schema version becomes 2.2. P-003 writes them.

### G-10: hold to talk

Fixed on main. `useHoldToTalk` uses the browser's speech recognition and sends `{ text }`. The phone needs HTTPS or localhost, so the test is on the tunnel. Role 2 should confirm that no server-side speech-to-text is planned, since `app/api/chat/route.ts` says the browser does it.

### G-12: email on users

Deferred (D6). `SSO_USER_MAP` in `.env.local` is enough for the demo. The `email` field comes after the demo.

### G-13 and D-01: health and the spec

P-001 keeps `GET /api/health` (D2 gate). Every new route has its entry in `lib/openapi.ts` in the same proposal.

### D-03: `api:check` against a shared database

P-001 makes `lib/api-check.ts` refuse any `MONGODB_URI` that is not `localhost` or `127.0.0.1` unless `ALLOW_SHARED_DB=1` is set. This review did not run `api:check`.

### S-01: the tunnel

D5 is a process rule: the tunnel is open only during supervised runs, with `DEMO_MODE=1`. The access stays open for as long as the tunnel is up. Role 1 should decide whether `?user=` is refused when a request comes through a tunnel host. It is not decided in code.

### D-02 and M-01: fixed on main

`fixtures/` now belongs to Role 3 in `owners.json`. The stale `requestedBy` comments are gone.

### M-02: Role 4

The repo copy of the Role 1 doc sits under `docs/`. Team contracts §2 gives `docs/` to Role 4. Role 4 syncs it from the vault.

### Not in the register

`quake-watcher.ts` still has no owner. `git log` shows who wrote it. That is for Role 4 or the author to assign.

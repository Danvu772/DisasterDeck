# API as it stands

Measured on 14 Nov 2026 at repo commit `c6063da`, against the dev server on `localhost:3000` (tmux session `dd`, window `dev`). Commit `77e7752` landed after that and changes only `docs/` and media, so the API described here still holds at `77e7752`. The probes were reads, plus POSTs with no credentials, which the server rejects before it writes anything. The machine-readable spec is at `/api/openapi.json` and Swagger UI is at `/api/docs`. This file covers what the spec leaves out: which routes exist, what each one needs, and who calls it.

## Routes

| Route | Method | Owner | Status | Auth | Notes |
|---|---|---|---|---|---|
| `/api/events` | POST | Role 1 | live, 401 without a caller | agent key, session cookie, or `?user=` with `DEMO_MODE=1` | Validates and queues the event. The Brain (`npm run brain`) turns `report` events into sites; other types wait for their handler |
| `/api/events` | GET | Role 1 | live | open with `DEMO_MODE=1`, else any caller | `?since=` ISO or epoch ms, `limit` 1–500 (default 50), `desk`. Oldest first, with `status` and `result`. Phones masked |
| `/api/chat` | POST | Role 2 | live, 401 without a caller | session cookie, or `?user=` with `DEMO_MODE=1` | Audio gets a canned reply (G-10). Limit: 8 a minute, 80 an hour per person |
| `/api/board` | GET | Role 1 | live | open with `DEMO_MODE=1`, else any caller | `getBoard()`, sorted by tier then priority, with `health`. `?desk=` picks another desk |
| `/api/inbox` | GET | Role 1 | 404 | planned: G-03 | `getUserContext().inbox` exists. Route file missing |
| `/api/health` | GET | Role 1 | live | none | `{ pending, oldestPendingSeconds, failed, lastLoopAt }` |
| `/api/users` | GET | Role 1 | 404 | planned: G-04 | Not in Team contracts §4 |
| `/api/openapi.json` | GET | Role 1 | live, 200 | none | The spec that Swagger UI reads |
| `/api/docs` | GET | Role 1 | live, 200 | none | Swagger UI page |
| `/api/auth/*` | GET, POST | Role 3 | live | Auth.js | `/api/auth/session` returns `null` when signed out |
| `/data/zones.geojson` | GET | Role 4 | live, 200 | none | Static file in `public/data/` |

Built from Team contracts §4: `POST /api/events`, `GET /api/board`, `GET /api/health` and the static zones file, plus `GET /api/events?since=`. Missing: `GET /api/inbox`. The frontend also needs `GET /api/users`, which the contract does not list.

## What `POST /api/events` accepts

The body is an event without `_id`, `status`, `ts`, `lane` or `actor`. Unknown fields are dropped. The schema is in `lib/schemas.ts`.

| `type` | Who may post | Required payload fields |
|---|---|---|
| `report` | Agents, or a signed-in person with `source: "person"` | `kind` (`trapped`, `missing`, `rescued`, `site_update`), `text`, `textEn` |
| `need` | Agents only. A person gets 403 and is told to use `/api/chat` | `item`, `quantity` (at least 1), `lifeThreatening` |
| `closure` | Agents, or a signed-in person with `source: "person"` | `road`, `state` (`closed`, `open`, `unconfirmed`), `reason` |
| `capacity` | Agents, or a signed-in person with `source: "person"` | `shelter`, `bedsUsed`, `bedsTotal` (used at most total) |
| `answer` | The task's assignee, with `source: "person"` | `taskId`, `result` (`accepted`, `declined`, `done`). Optional `note`, `etaMinutes` |
| `approval` | Coordinators only, with `source: "person"` | `taskId`, `approved` |
| `alert` | Agents only (the satellite watcher) | `zoneId`, `kind` (`silent_zone`, `cold`), `evidence` |
| `incident` | Anyone. On a task, the assignee or a coordinator | `kind` (9 values, see `lib/types.ts`), `text`, `textEn`, `canContinue`. Optional `taskId`, `coords`, `canDeliver`, `resolved`, `incidentId` |
| `claim` | Agents, or a signed-in person with `source: "person"` | `what` (`call`, `rescue`, `deliver`, `assist`), `text`, `textEn` |
| `correction` | Only with `source: "person"` | `action` (`retract`, `edit`, `split`, `merge`), `recordType`, `recordId`, `reason` |
| `plan` | Agents only | `zoneExits`, `reason` |

The rules the route enforces, from `app/api/events/route.ts`:

- A signed-in person always posts as themselves. The `actor` in the body is ignored.
- Agents send `x-agent-key`, and may name themselves with `actor`.
- `approval`, `answer` and `correction` must carry `source: "person"`. A social post never approves anything.
- `approval` needs the caller's role to be `coordinator`.
- `answer` needs the caller to be the task's assignee.
- An `incident` on a task needs the caller to be the assignee, or a coordinator when the caller is a person.
- A missing `taskId` returns 404 `task ... not found`.

Responses: `200 { "id": "..." }`, `400` for a body that is not JSON or does not match the schema (with `issues`), `401`, `403`, `404`, and `500` with "safe to retry with the same dedupeKey".

## What the frontend calls

Measured by reading the components. "Fallback" is what the screen shows when the call fails, where the code says so.

| Screen or component | Call | When | Fallback |
|---|---|---|---|
| `/` `LiveBoard` | `GET /api/board` | every 1 s, every 10 s after a failure | `fixtures/board.ts`, marked as demo data |
| `/map` `DeskMap` | `GET /api/board`, `GET /data/zones.geojson` | every 1 s | fixtures |
| `/coordinator` `CoordinatorDesk` | `GET /api/board` | every 1 s | fixtures |
| `/field` `FieldPhone` | `GET /api/board` | every 1 s | fixtures, marked as demo data |
| Task buttons (`taskEvents.ts`) | `POST /api/events?user=` with `answer` or `incident` | on press | the server's error text on the card |
| `/coordinator` `ApprovalCard` | `POST /api/events?user=` with `approval` | on press | "Not sent: ..." |
| `/field` outbox (`useOutbox.ts`) | `POST /api/events?user=` with `answer` or `incident` | queued, then retried | local outbox |
| `/field` hold to talk (`useHoldToTalk.ts`) | `POST /api/chat?user=` with `audioBase64` and `mimeType` | on release | not checked |
| `/agent` `AgentDesk` | `POST /api/chat?user=` | on send | `stubReply()`, marked "Stub agent" |
| Ask the desk (`AskDesk.tsx`) | `POST /api/chat?user=` | on send | not checked |
| Nav account (`Account.tsx`) | `auth()` on the server | page load | none, signed-out state |

Every call from a page sends `?user=` as well as the session cookie. With SSO working, the cookie wins, and `?user=` only matters in demo mode.

## Checked by hand

These commands ran against the dev server during this review. They send no credentials and write nothing.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/openapi.json   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/board          # 404
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/events?since=2026-11-14T00:00:00Z"   # 405
curl -s -X POST http://localhost:3000/api/events -H 'content-type: application/json' --data '{}'         # 401 {"error":"not signed in"}
curl -s -X POST http://localhost:3000/api/chat -H 'content-type: application/json' --data '{"text":"hi"}' # 401 {"error":"who is talking? ..."}
```

The database was read with a count script that only calls `countDocuments`. At the time of the probe it held: `users` 9, `shelters` 3, and 0 each in `events`, `sites`, `needs`, `roads`, `incidents`, `tasks`, `inbox` and `messages`. `zones` is 0 because zones come from the static file, not the database.

`npm run api:check` was not run. It writes test events and a test task into whatever `MONGODB_URI` points at, and `.env.local` points at the shared Atlas cluster (gap D-03).

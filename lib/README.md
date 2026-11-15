# `lib/`: the collective memory

Owned by **Role 1**. This folder holds the shared data types and the code that talks to MongoDB.
Everyone may **call** these functions. Only Role 1 changes them, and announces it first.

| File | What it is |
|---|---|
| `types.ts` | The data shapes from Team contracts §3 (version 2.1) |
| `db.ts` | The connection, the indexes, `postEvent()`, and the read functions |
| `schemas.ts` | Runtime (zod) checks for every event payload, kept in step with `types.ts` by `tsc` |
| `auth.ts` | Who is calling: agent key, login session, or `?user=` in demo mode |
| `seed.ts` | Loads `data/seed.json` (users, shelters): `npm run db:seed` |
| `db-check.ts` | A smoke test: `npm run db:check` |
| `api-check.ts` | Checks `POST /api/events` (identity, permissions, validation) and that the API docs list every route: `npm run api:check` |
| `openapi.ts` | The OpenAPI description of the HTTP API, shown at `/api/docs` |
| `rules/` | Later: the dispatcher's plain-code rules (`priority.ts`, `assign.ts`, `incidents.ts`) |

---

## 1. Set up (5 minutes)

You need Docker and Node 22.

```bash
npm install
cp .env.example .env.local     # never commit .env.local
npm run db:up                  # local MongoDB 8 in Docker, waits until it is healthy
npm run db:seed                # the demo users and shelters from data/seed.json
npm run db:check               # should end with "All checks passed."
npm run api:check              # needs AGENT_KEY set and DEMO_MODE=1 in .env.local
```

`npm run db:up` runs `docker compose up -d --wait mongo` (see `docker-compose.yml`). The database
is a single-node replica set on `127.0.0.1:27017`, so it behaves like Atlas. The data survives
restarts.

| Command | Does |
|---|---|
| `npm run db:up` | Start MongoDB (or do nothing if it is already running) |
| `docker compose stop` | Stop it, keep the data |
| `docker compose down -v` | Stop it and **wipe** the data |
| `docker compose exec mongo mongosh disaster_desk` | Open a shell on the database |

You can also browse it with MongoDB Compass at `mongodb://127.0.0.1:27017/?directConnection=true`.

### Environment (`.env.local`)

| Variable | Local value | Notes |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/?directConnection=true` | For Atlas, Role 1 shares a `mongodb+srv://…` URI privately |
| `MONGODB_DB` | `disaster_desk` | Database name |
| `DESK_ID` | `malatya-2023` | Default `deskId` for events and the board |
| `AGENT_KEY` | ask Role 1 | Workers send it as `x-agent-key` |
| `DEMO_MODE` | `1` | Allows `?user=ID` on the API |

Next.js loads `.env.local` by itself. Workers run with `tsx --env-file=.env.local workers/<name>.ts`.

### Moving to Atlas

Put the Atlas URI in `MONGODB_URI` and run `npm run db:check`. The indexes are created on the
first connection, so nothing else changes.

---

## 2. Using it from code

Import from `@/lib/db` in the Next.js app, or from a relative path (`../lib/db`) in `workers/`.
**Server code only**: route handlers, server components and workers. Never import it from a
`"use client"` file. The browser goes through the API routes (§3).

### `postEvent(e)`: the only way anything enters memory

```ts
import { postEvent } from "@/lib/db";
import type { ReportPayload } from "@/lib/types";

const id = await postEvent<ReportPayload>({
  type: "report",
  source: "x",
  actor: "x-agent",                 // the server decides who the actor is, never the client
  dedupeKey: `x:${tweet.id}`,       // the same key twice → no new event, the old id comes back
  observedAt: new Date(tweet.createdAt), // when it was true. Default: now
  payload: { kind: "trapped", text: tweet.text, textEn, address, coords },
});
```

- The desk sets `_id`, `ts`, `status: "pending"` and `lane`. Lane is 0 for `source: "person"` or
  `"system"` (people on the desk and the sweeper go first), and 1 for everything else.
- `deskId` defaults to `DESK_ID`.
- Agents never write records. They post events, and the memory keeper (Role 1) turns them into
  sites, needs, roads, shelters, zones and incidents.

### `getUserContext(userId)`: what a personal agent loads every turn

```ts
const { user, inbox, tasks, records, needs, incidents, messages } = await getUserContext("team-4");
```

| Field | Contents |
|---|---|
| `user` | The person with their `profile` (the context file), or `null` |
| `inbox` | Unread items, newest first |
| `tasks` | Their open tasks, by tier, then priority (highest first). `tasks[0]` is what they do next |
| `records` | The sites, needs, roads, shelters, zones or incidents those tasks point to |
| `needs` | Needs this person asked for (`requestedBy`) that are not delivered or cancelled |
| `incidents` | Their problems that are not resolved |
| `messages` | Their last 10 chat messages, oldest first |

### `getBoard(deskId?)`: everything the shared board shows

```ts
const { sites, needs, roads, shelters, zones, incidents, tasks, health } = await getBoard();
```

Sites, needs and tasks are sorted by tier, then priority. Roads are newest first, shelters and
zones by name. The shape matches `fixtures/board.ts`, so a screen can swap the fixture for the
real thing.

### `getHealth()`

`{ pending, oldestPendingSeconds, failed, lastLoopAt }`. A growing `pending` count means the Brain
loop is down. `failed` counts events that threw three times.

### `searchMemory(q)`: read only, behind the `ask_desk` tool

```ts
const hits = await searchMemory({ collection: "shelters", region: "malatya-merkez", text: "okul" });
// → [{ record: Shelter, ageSeconds: 360 }, …]
```

`collection` is one of `sites`, `needs`, `roads`, `shelters`, `zones` or `incidents`. `region`
and `status` match exactly. `text` is a case-insensitive match on names, addresses, items and
roads. `limit` defaults to 20 (max 100). Every hit carries `ageSeconds`, taken from the fact's
`observedAt`, so the agent can say "6 minutes ago".

### Lower level (Role 1)

`cols()` returns typed collections (`events`, `sites`, …, `inbox`, `users`, `messages`).
`newId()` makes a string id, and `markLoop()` stamps the Brain loop's heartbeat. Only the owner
of a collection writes to it (Team contracts §2).

---

## 3. HTTP endpoints

Screens and remote clients use these. The `lib/` functions above sit behind them, in `app/api/`.
The shapes are fixed by Team contracts §4.

### Browse them: `/api/docs`

With `npm run dev` running, open **http://localhost:3000/api/docs**. It's Swagger UI over
`/api/openapi.json`: every endpoint, its body and responses, examples, and **Try it out**.
Click **Authorize** and either paste the `x-agent-key`, or type a seeded user id (for example
`coordinator-duty`) into `user` when `DEMO_MODE=1`. If you're signed in with SSOJet, your
cookie is sent automatically.

The list comes from `lib/openapi.ts`. Next.js can't discover routes by itself, so that file is
the registry. The event body there is generated from `schemas.ts`. **When you add a route, add
it to `lib/openapi.ts`** (or to `UNDOCUMENTED` there). Otherwise `npm run api:check` fails and
names the route.

| Method | Path | Body / query | Returns | Status |
|---|---|---|---|---|
| `POST` | `/api/events` | An event: `type`, `source`, `payload`, optional `deskId`, `observedAt`, `dedupeKey`, `actor` | `{ id }` | **Built** |
| `POST` | `/api/chat` | `{ text?, imageBase64?, coords? }` | `{ reply, eventIds, actions }` | **Built** (Role 2) |
| `GET` | `/api/openapi.json`, `/api/docs` | (none) | The API description, and the Swagger UI page | **Built** |
| `GET` | `/api/board` | (none) | `Board` (`getBoard()`) | Not yet |
| `GET` | `/api/inbox` | (none) | `InboxItem[]` of the signed-in person; also stamps `lastSeen` | Not yet |
| `GET` | `/api/health` | (none) | `Health` (`getHealth()`) | Not yet |

### `POST /api/events`

**Who is calling?** The server works it out in this order and sets `actor` itself:

1. **Header `x-agent-key: $AGENT_KEY`**: a worker or the scenario player. It may name itself with
   `"actor": "x-agent"`. Without that, the actor is `<source>-agent` (for example `nasa-agent`).
2. **The login session**: SSOJet through Auth.js (Role 3's `/auth.ts`), read by `getSessionUserId()` in `auth.ts`.
3. **`?user=<id>`**, only when `DEMO_MODE=1`. The id must be a seeded user.

A signed-in person is always the actor. An `actor` in their body is ignored.

**What is checked.** These rules apply to the actor, however the request arrived:

| Rule | Status code |
|---|---|
| The payload matches its type's schema in `schemas.ts`. Unknown fields such as `_id`, `status`, `ts` and `lane` are dropped | 400 |
| A signed-in person posts with `source: "person"`, never `"x"` or `"nasa"` | 403 |
| A person cannot post a `need` directly. Needs go through their agent (`/api/chat`) | 403 |
| `alert` and `plan` come only from agents (the satellite watcher, the planner) | 403 |
| `approval`, `answer` and `correction` need `source: "person"`. A social post never approves anything | 403 |
| `approval` only from a coordinator, for a task that exists | 403 / 404 |
| `answer` only from the task's assignee | 403 / 404 |
| An `incident` about a task, from a person: only its assignee or a coordinator | 403 / 404 |

The route does **not** check task state, for example whether the task is still waiting for
approval. The Brain loop applies events one at a time and decides then, so two clicks cannot
race.

**Responses.** `200 { id }` on success. Posting the same `dedupeKey` again returns the first
event's id, so retries are safe. Errors look like `{ error, issues? }`: 400 bad input, 401 not
signed in or wrong key, 403 not allowed, 404 no such task, 500 server error (safe to retry).

**Examples**

```bash
# A worker (key from .env.local)
curl -X POST localhost:3000/api/events \
  -H "content-type: application/json" -H "x-agent-key: $AGENT_KEY" \
  -d '{"type":"report","source":"x","actor":"x-agent","dedupeKey":"x:123",
       "observedAt":"2023-02-06T04:30:00Z",
       "payload":{"kind":"trapped","text":"…","textEn":"…","address":"Örnek Sk. 12"}}'

# A task button in demo mode: the assignee accepts
curl -X POST "localhost:3000/api/events?user=field-alpha" \
  -H "content-type: application/json" \
  -d '{"type":"answer","source":"person","payload":{"taskId":"<task id>","result":"accepted","etaMinutes":30}}'
```

From a browser screen (Role 3), the same thing:

```ts
await fetch(`/api/events?user=${user._id}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "answer", source: "person", payload: { taskId, result: "accepted" } }),
});
```

Role 2 code that runs on the server (`/api/chat`) calls `postEvent()` directly instead of
going over HTTP. It should still check what the model produced with
`payloadSchemas[type].safeParse(payload)` from `schemas.ts` first.

---

## 4. Indexes (created by `db.ts` on first connect)

| Collection | Index | Why |
|---|---|---|
| `events` | `{ status, lane, ts }` (`take`) | The keeper takes lane 0 first, then the oldest |
| `events` | `{ dedupeKey }` unique, sparse (`dedupe`) | The same post twice is ignored |
| `tasks` | `{ recordId, type }` unique where `open: true` (`one_open_task`) | No second open task for the same record and type |
| `inbox` | `{ userId, status, ts: -1 }` (`inbox_poll`) | Inbox polling every second |

## 5. Contract changes

| Version | Change |
|---|---|
| 2.1 | `Need.requestedBy: string[]`. `getUserContext()` also returns `needs`. Helper types `NewEvent`, `Board`, `Health`, `UserContext`, `SearchQuery`, `SearchHit` |
| 2.1 + `schemas.ts` | Runtime checks for every payload. No type changed |

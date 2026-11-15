# `lib/`: the collective memory

Owned by **Role 1**. This folder holds the shared data types and the code that talks to MongoDB.
Everyone may **call** these functions. Only Role 1 changes them, and announces it first.

| File | What it is |
|---|---|
| `types.ts` | The data shapes from Team contracts §3 (version 2.1) |
| `db.ts` | The connection, the indexes, `postEvent()`, and the read functions |
| `db-check.ts` | A smoke test: `npm run db:check` |
| `rules/` | Later: the dispatcher's plain-code rules (`priority.ts`, `assign.ts`, `incidents.ts`) |

---

## 1. Set up (5 minutes)

You need Docker and Node 22.

```bash
npm install
cp .env.example .env.local     # never commit .env.local
npm run db:up                  # local MongoDB 8 in Docker, waits until it is healthy
npm run db:check               # should end with "All checks passed."
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

Screens and remote clients use these. The `lib/` functions above sit behind them. They live in
`app/api/` and are Role 1's next deliverable: **not built yet**. The shapes are fixed by Team
contracts §4.

| Method | Path | Body / query | Returns | Backed by |
|---|---|---|---|---|
| `POST` | `/api/events` | `NewEvent` without `actor` | `{ id }` | `postEvent()` |
| `GET` | `/api/board` | (none) | `Board` | `getBoard()` |
| `GET` | `/api/inbox` | (none) | `InboxItem[]` of the logged-in person; also stamps `lastSeen` | `cols().inbox` |
| `GET` | `/api/health` | (none) | `Health` | `getHealth()` |

**Who is the actor?** The server sets `actor`, never the request body:
- **Logged-in person**: from the SSOJet session.
- **Workers and the scenario player**: send the header `x-agent-key: $AGENT_KEY` and may name
  themselves with `"actor": "x-agent"`.
- **`DEMO_MODE=1` only**: `?user=team-4` acts as that seeded user.

The API also enforces that an `approval` is accepted only from a coordinator, and an `answer` only
from the task's assignee.

Example, once the route exists:

```bash
curl -X POST localhost:3000/api/events \
  -H "content-type: application/json" -H "x-agent-key: $AGENT_KEY" \
  -d '{"type":"report","source":"x","actor":"x-agent","dedupeKey":"x:123",
       "payload":{"kind":"trapped","text":"…","textEn":"…"}}'
```

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

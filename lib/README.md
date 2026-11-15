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
| `geo.ts` | Distance (haversine), and address and text normalisation for the merge rules |
| `rules/merge.ts` | Which site a report belongs to: same text, then within 100 m or the same address, else new |
| `rules/priority.ts` | Tier, score (`10 × support + minutes waiting + NASA terms`), confidence, support |
| `keeper-check.ts` | CP1 check of the memory keeper on a throwaway desk: `npm run keeper:check` |

## The Brain: `npm run brain`

The Brain is the one loop that turns events into records (`workers/brain.ts`): it takes the next
event (people first, then the oldest), the memory keeper (`workers/memory-keeper.ts`) applies
it, the dispatcher reacts (CP2), and the sweeper puts stuck events back in the queue.

- **Run exactly one per database.** It holds a lease in Atlas, so a second `npm run brain`
  (yours or a teammate's) just waits, and takes over within ~15 s if the first one stops.
- **Handled today:** `report` → sites. Other event types stay `pending` until their handler
  lands, so nothing is thrown away.
- **Is it running?** `GET /api/health`: `lastLoopAt` updates every second while it runs.
- Every event ends `done`, `merged` or `rejected`, with `result.reason` saying why. The feed
  (`GET /api/events?since=`) shows it.

---

## 1. Set up (5 minutes)

The whole team shares **one MongoDB Atlas cluster**. You need Node 22 and two values that Role 1
sends you privately (never in a channel, never in git): `MONGODB_URI` and `AGENT_KEY`.

```bash
npm install
cp .env.example .env.local     # paste MONGODB_URI and AGENT_KEY; never commit .env.local
npm run db:check               # connects, makes sure the indexes exist; ends "All checks passed."
```

That's all a teammate needs. The other commands:

| Command | Who runs it | Does |
|---|---|---|
| `npm run db:seed` | **Role 1 only** | Loads the demo users and shelters from `data/seed.json`. It's one shared database, so once is enough |
| `npm run api:check` | Anyone | Checks `POST /api/events` and that `/api/docs` lists every route. Needs `AGENT_KEY` and `DEMO_MODE=1` |
| `npm run keeper:check` | Anyone | Checks the memory keeper (CP1) |
| `npm run brain` | **One person** | The Brain loop. Only one runs per database: a second one waits (see below) |

`api:check` and `keeper:check` write only to throwaway desks (`check-api`, `check-cp1`) and
delete everything they made, so they never show up on the shared board.

To look at the data, open the cluster in the Atlas web UI and use **Browse Collections**
(database `disaster_desk`), or paste the same `MONGODB_URI` into MongoDB Compass.

### Environment (`.env.local`)

| Variable | Value | Notes |
|---|---|---|
| `MONGODB_URI` | from Role 1 | The Atlas `mongodb+srv://…` URI. Empty: the agents fall back to fake data |
| `MONGODB_DB` | `disaster_desk` | Database name |
| `DESK_ID` | `antakya-2023` | Default `deskId` for events and the board |
| `AGENT_KEY` | from Role 1 | Workers send it as `x-agent-key` |
| `DEMO_MODE` | `1` | Allows `?user=ID` on the API |

Next.js loads `.env.local` by itself. Workers run with `tsx --env-file=.env.local workers/<name>.ts`.

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
- Check anything a model produced before posting it: `payloadSchemas[type].safeParse(payload)`
  from `schemas.ts`. These are the same checks `POST /api/events` runs.

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
const hits = await searchMemory({ collection: "shelters", region: "antakya-merkez", text: "okul" });
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

The browser and remote workers reach the functions above through the routes in `app/api/`.
They're documented in Swagger UI at **http://localhost:3000/api/docs** (with `npm run dev`
running). See `app/api/README.md` for how to use it and how to add a route.

---

## 4. Indexes (created by `db.ts` on first connect)

| Collection | Index | Why |
|---|---|---|
| `events` | `{ status, lane, ts }` (`take`) | The keeper takes lane 0 first, then the oldest |
| `events` | `{ dedupeKey }` unique, sparse (`dedupe`) | The same post twice is ignored |
| `tasks` | `{ recordId, type }` unique where `open: true` (`one_open_task`) | No second open task for the same record and type |
| `inbox` | `{ userId, status, ts: -1 }` (`inbox_poll`) | Inbox polling every second |
| `events` | `{ deskId, result.textKey }` partial (`copies`) | Memory keeper: was this exact text reported before? |
| `events` | `{ deskId, ts }` (`feed`) | `GET /api/events?since=` |

## 5. Contract changes

| Version | Change |
|---|---|
| 2.1 | `Need.requestedBy: string[]`. `getUserContext()` also returns `needs`. Helper types `NewEvent`, `Board`, `Health`, `UserContext`, `SearchQuery`, `SearchHit` |
| 2.1 + `schemas.ts` | Runtime checks for every payload. No type changed |
| 2.2 | `Event.result.textKey?` (optional): the normalized report text, so the keeper can spot copies |
| 2.3 | `Task.checkinAt?` (optional): when the sweeper sent the check-in for a task past its ETA |
| 2.4 | All optional: `HistoryEntry.eventId`, `Road.region/source/trust`, `Shelter.source/trust`, `Zone.region/history`, `InboxItem.key` (handlers for closure, capacity, alert, correction) |

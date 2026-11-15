# Role 1 handoff: Darshal → Dan

From 15 Nov, Dan owns Role 1 (Backend and Brain). This is everything open, in priority order.
Context: the Role 1 checklist in the vault ("Roles/Role 1 - Backend and Brain.md") is fully
ticked. The code for it is on `main`, so start from there.

## What is on main and how to check it

| Area | Commit | Check |
|---|---|---|
| Foundations, `POST /api/events`, Swagger at `/api/docs` | e582d26, 6a5c440, 13a1d5d | `npm run api:check`, `db:check` |
| CP1 memory keeper, Brain loop with a lease, board, health, feed | 76427c5 | `keeper:check` |
| Sweeper timers: no answer → next person, check-in → unreachable, priority over time | a84aa00 | `sweeper:check` |
| Handlers: closure, capacity, alert, correction (retract/edit), trust conflicts | e85ca71 | `handlers:check` |
| Dispatcher gaps: need notices, stock ≥ quantity, big-move and evacuation approvals, assignee check, no re-proposed rejected rescue | 1459702 | `dispatch:check` |
| Help-desk playbook table: relay vs fresh delivery, assist task, ETA notices, short_supply, road_blocked, cannot_find, unsafe/injury | 7f3e212 | `helpdesk:check` |
| `db:reset` (one desk, safety flags) and `load:check` (replay twice) | fdf5fec | `load:check` |

Every check writes only to its own throwaway desk (`check-*`). Your `reconcile()` and
`redelegate()` (e4c9206) already cover "escalated tasks never come back", so that is not
listed below.

## 1. Tasks still escalate in an unattended demo (open)

What happened at 08:19–08:21 UTC on malatya-2023, from the tasks' own history:
- 3 call tasks were made. All 3 went to `volunteer-mechanic`, the only volunteer who counted
  as present: `volunteer-callback` was last seen 75 min earlier.
- Nobody had that screen open, so after 2 min the sweeper timed them out, and they escalated.

Still to fix:
- **"Never seen" counts as present.** In `lib/rules/assign.ts` (pickPerson), a user with no
  `lastSeen` passes the 3-minute rule, but someone seen 75 min ago fails it. So tasks go to
  people who have never logged in. Suggest treating a missing `lastSeen` as not seen, or
  stamping `lastSeen` when a person opens any screen.
- **2 minutes to answer** (`ANSWER_MINUTES` in `workers/dispatcher.ts`) suits a rehearsed demo
  with people at the screens. Read it from the env (e.g. `ANSWER_MINUTES=10`) for unattended
  runs.
- Remember the rule: "present" means that person's `/agent` page is polling `/api/inbox`.

## 2. Check scripts leave records when a live Brain runs (open, small)

Your Brain processes the checks' test events on their throwaway desks. The checks then delete
only the events, not the sites, tasks and inbox items the Brain made from them. Leftovers on
15 Nov:
- `check-db`: 2 sites and 2 escalated tasks.
- `check-api`: 6 escalated tasks.

To fix it, make each check's cleanup delete every collection for its desk:
`npm run db:reset -- --desk check-db` does it. Then wipe those leftovers once. They do not
show on the real board.

## 3. Knowledge base / semantic "Ask the desk" (decided, not started)

Today `ask_desk` (Role 2) picks one of 8 fixed topics and reads a filtered board, so free-text
questions fail. Examples: "anyone reporting a gas smell?", "what do we know about Turuncu
Avlu?". Raw post text and record histories are not searchable at all.

Decided with Darshal:
- **Embeddings: OpenAI `text-embedding-3-small`.** It is multilingual and cheap, and it puts
  OpenAI back in the product: the Future of Intelligence track requires OpenAI models, and the
  agents run on Claude. Needs `OPENAI_API_KEY`.
- **Store: Atlas Vector Search** on the same cluster. Search indexes work there; it runs
  MongoDB 8.0. This also helps the MongoDB Atlas prize story.
- **Shape: retrieval in Role 1, answering in Role 2.**
  - Role 1 builds a `searchKnowledge(query, { role, desk })` in `lib/` and `GET /api/search`:
    ranked records and posts, each with source and age, masked phones, and the same role
    rules as ask_desk (a citizen sees only shelters and roads).
  - Embed on write, from the memory keeper, so it stays the single writer.
  - Role 2 adds a "search" option to `ask_desk`, so the agents and the board's Ask box use it.
  - There is no second answering path.

## 4. Things to agree or tidy

- **Desk id.** `lib/db.ts` defaults `DESK_ID` to `antakya-2023`, and `data/seed.json` is for
  `antakya-2023`. The live data and the `.env.local` files use `malatya-2023`. Pick one for the
  demo.
- **The Brain writes `users.status`** (busy during an incident, available again after) in
  `workers/memory-keeper.ts` (setBusy, freePeople). Team contracts says only the API writes
  users. Keep it or move it.
- **Seeded shelters have no `trust`**, so they count as public, and an Instagram or X update
  can overwrite them. That is intended for the §8.4 demo. Add `trust` to the seed if not.
- **Role 2: `workers/x-agent.ts` stamps `observedAt` with "now"**, not the tweet's time, so
  waiting times start at zero on every replay. Also, `agents/scripts/lib-check.ts` still
  mentions `npm run db:up`, which was removed: Docker is gone and Atlas is the only database.
- **Real 2023 tweets (optional).** `docs/.../Data sources.md` names the HF dataset
  `ctoraman/deprem-tweet-dataset`, about 1,000 labelled tweets. Nothing imports it.
  - Anonymise first: they are real people, with real names, addresses and phones.
  - Geocode the addresses ahead of time.
  - Then `workers/x-agent.ts --file …`. Costs about $6 with real extraction.

## 5. Access and after the hackathon

- **The Atlas cluster is in Darshal's Atlas account.** Ask him for project access if you need
  the Atlas UI. `MONGODB_URI` and `AGENT_KEY` came from him privately.
- **Network access is `0.0.0.0/0`** for the venue Wi-Fi. After the hackathon, Darshal deletes
  the cluster. That also stops billing if it is on Flex.

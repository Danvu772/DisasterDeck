# Architecture

## The problem

After an earthquake, the same call for help arrives as ten tweets, a phone call and a news line, and a coordinator has to decide who goes where before the next aftershock. The desk merges those voices into one record per site, ranks the records by rules, sends the next step to the right person, and asks a human before anything risky happens.

## The five boxes

```
 1. INPUTS                 2. RESEARCH AGENTS            4. COLLECTIVE MEMORY
 X replay, news,           workers/x-agent.ts            MongoDB, one database
 quake feeds, sheet,       workers/news-agent.ts         events    the queue and the log
 satellite files,          workers/quake-watcher.ts      sites, needs, roads, shelters,
 people typing             workers/sheet-sync.ts         zones, incidents   (records)
        |                  workers/satellite-watcher.ts  tasks, inbox       (work)
        v                         |                      users, messages, meta
 text, photos, numbers            | postEvent()                 ^        |
        |                         v                             |        |
        +----------------> POST /api/events  ---> events ---> 3. BRAIN   |
                           (lib/db.ts postEvent)    pending    workers/brain.ts
                                  ^                            takes one event at a time
                                  |                            keeper writes records
 5. PEOPLE + PERSONAL AGENTS      |                            dispatcher writes tasks, inbox
 agents/personal/turn.ts          |                            sweeper runs the timers
 one agent per person,            |                                   |
 reads that person's slice        +---- events from people            v
 of memory, answers, posts  <------------ GET /api/board, /api/inbox, getUserContext()
 events through tools             screens poll the board every second
```

Every arrow into memory is an event. Nothing else writes a record. Every arrow out of memory is a read.

## One event's life, from a post to a closed site

A volunteer types "a person is trapped at Orange Courtyard" to their agent. These are the hops.

1. `components/AgentDesk.tsx` sends the text to `POST /api/chat` (`app/api/chat/route.ts`). The route decides who is talking from the login session, or from `?user=` on localhost only. It rate-limits per person.
2. `runTurn()` in `agents/personal/turn.ts` loads that person's context with `getUserContext()` (`lib/db.ts`), masks phone numbers (`agents/shared/privacy.ts`), and calls Claude with the tools for their role (`toolsFor()` in `agents/personal/tools.ts`).
3. Claude picks `file_report`. `runTool()` runs it, and `post()` in `tools.ts` calls `desk().postEvent()` (`agents/desk/lib-desk.ts`), which calls `postEvent()` in `lib/db.ts`. A research agent takes the same road from step 3 on. `workers/x-agent.ts` extracts the tweet with `extractTweet()` (`agents/research/x-extract.ts`) and posts it with a `dedupeKey`. Direct HTTP posts go through `POST` in `app/api/events/route.ts`, which validates the body with `eventBody` (`lib/schemas.ts`), sets the actor from the login, and applies `authorize()`.
4. `postEvent()` inserts the event as `pending`. People and the sweeper get lane 0, everything else lane 1. The unique `dedupe` index makes a retry return the first id.
5. `workers/brain.ts` runs `takeNext()`, which atomically flips the next event (lane 0 first, then oldest) to `working`. `processEvent()` passes it to `apply()` in `workers/memory-keeper.ts`.
6. `applyReport()` re-validates the payload, masks the text, and asks `decideReport()` (`lib/rules/merge.ts`) which site it belongs to: same normalized text, then within 100 m or the same address, else a new site. A new voice adds a source and raises `support`. A copy of known text adds a source and no support. `confidence()` and `scored()` in `lib/rules/priority.ts` set confidence, tier, priority and the `scoreParts` the screen shows. The event ends `done`, `merged` or `rejected`, with `result.reason` saying why.
7. `processEvent()` hands the keeper's changes to `react()` in `workers/dispatcher.ts`. `siteChanged()` sees a site that nobody has called and calls `createFor("call", ...)`. `createTask()` asks `pickPerson()` (`lib/rules/assign.ts`) for the nearest free volunteer seen in the last 3 minutes, inserts a task, and writes one inbox item.
8. The volunteer's phone (`components/field/FieldPhone.tsx`, or `components/taskEvents.ts` on the agent page) posts an `answer` event. `applyAnswer()` checks the answerer is the assignee and the task is still open, then moves the site. A finished call marks the site verified and confirmed.
9. The dispatcher sees a verified site with people still trapped and creates a rescue task. Rescue is `risk: "high"`, so `createTask()` sets `waiting_approval` and only proposes a team. `inboxCoordinators()` writes one approval item per coordinator.
10. A coordinator taps approve in `components/coordinator/ApprovalCard.tsx`, which posts an `approval` event. `applyApproval()` rejects anyone who is not a coordinator. `approved()` in the dispatcher assigns the proposed team, or the person the coordinator picked with Modify.
11. The field team posts `answer` with `progress: "arrived"`. `applyAnswer()` moves the site to `team_on_site`. Their `done` answer moves it to `closed`.
12. After every event `processEvent()` calls `bumpDeskVersion()`, and `GET /api/board` (`app/api/board/route.ts`, `getBoard()`) returns the new state. `components/map/usePolled.ts` polls it, so the board, the map and the detail panel show the closed site within a second or two.

If a step fails, the Brain retries the event up to 3 times. `sweeper.tick()` (`workers/sweeper.ts`) puts events stuck in `working` back in the queue, hands an unanswered task to the next person after 2 minutes, asks "still on your way?" after a missed ETA, and posts an `unreachable` incident when nobody answers.

## The rules that keep it safe

**One writer per collection.** Only the memory keeper writes sites, needs and incidents. Only the dispatcher writes tasks and inbox items. The sweeper writes nothing itself. It calls the dispatcher and the keeper or posts an event. Only one Brain runs per database. It holds a 15 second lease in `meta` (`acquireLease()` in `workers/brain.ts`), so a second one waits. The unique `one_open_task` index in `ensureIndexes()` stops a replayed event from creating a second open task for the same record and type. The chat history in `messages` is the one collection the agents write directly.

**Agents never talk to each other.** A research agent and a personal agent share no function calls and no messages. Both read through the `DeskPort` interface (`agents/desk/port.ts`) and both write by posting an event. What one agent knows reaches another only after the keeper has turned it into a record.

**The LLM reads and explains, rules allocate.** Claude drafts text, extracts fields from a tweet, and files events through tools. It never picks who goes to a site. Merge, scoring, assignment, escalation and every timer are plain functions in `lib/rules/` and `workers/`, with no model call. Tool access is a per-role allowlist (`ROLE_TOOLS` in `tools.ts`). Charts follow the same split. Claude names a metric with `visualize_metric` and the numbers come from pure functions in `components/metrics/compute/`. A metric without data returns `unknown` with a reason, never a made-up number. Model spend has a hard budget in `agents/shared/cost.ts`.

**Approvals for risky work.** A high-risk task waits for a coordinator before anyone receives it. Claude can call `decide_approval` for a coordinator, and the keeper still checks that the actor is a coordinator and the task is waiting.

**Demo identity only on localhost.** `?user=` works only when `DEMO_MODE=1` and `isLocalDemo()` (`lib/localDemo.ts`) says the request came from this machine. It rejects proxy headers, a forwarded chain, and a non-local host. `middleware.ts`, `resolveCaller()` and `canRead()` in `lib/auth.ts`, and `app/api/chat/route.ts` all use it. Anything through a tunnel must sign in or carry `x-agent-key`. The server refuses an `AGENT_KEY` shorter than 24 characters and compares keys in constant time. A signed-in person can only post as themselves, with source `person`, and cannot post needs, alerts or plans directly.

**Privacy.** Phone numbers are masked before text reaches Claude, the stored records or the log. The event feed masks them again on the way out.

## How it is tested

| Check | What it covers | Command |
|---|---|---|
| Keeper and dispatcher | 23 cases on a throwaway desk `check-cp1`: tweets merge into one site, copies add no support, odd spellings match, a crash replay adds nothing, call, accept, done, approval with Modify, arrived, decline, incident blocks a task and sends a replacement, need merge, claim, and the feed masks phones. Deletes everything it made | `npm run keeper:check` |
| Sweeper | Stuck events, no answer, check-in, unreachable, priority refresh, with a moving clock | `npm run sweeper:check` |
| API | Identity, permissions and validation on `POST /api/events`, and that `/api/docs` lists every route | `npm run api:check` |
| Contract | The running API still matches the shapes the screens read and post. Uses ids that do not exist, so it never writes | `npm run check:contract` |
| Security | A forwarded request cannot use demo identity, pages redirect to login, the board answers 401, role rules hold. Posts only to a fake desk | `npm run security:check` |
| Database | Connection and indexes | `npm run db:check` |
| Scenario and satellite | Unit tests of the cue planner and the zone poster | `node --test scripts/scenario-player.test.mjs scripts/satellite-watcher.test.mjs` |
| Pilot data | Imagery, NASA products and seed validate offline | `npm run check:pilot` |
| Ownership | A change to the other role's folder needs an approved proposal | `node api_front_back_gap/check.mjs --as role-3` |
| End to end | Headless Playwright workflows with video, screenshots and traces, in its own `e2e/` package. Task t43, not merged into `main` when this was written | `npm test` inside `e2e/` |
| CI | `.github/workflows/ci.yml` runs `tsc`, `eslint`, `check:tokens` and `next build` on every push and pull request to `main`. It needs no database, so none of the checks above that talk to MongoDB run in CI | GitHub Actions |

The database checks and `security:check` need a live database or dev server. We run them by hand before a push.

## What is real and what is synthetic

Real: the MongoDB cluster and every write path above, the Claude calls and their spend, the sign-in, NASA Black Marble night lights, NASA POWER weather and GIBS imagery, Maxar satellite imagery from December 2022 and February 2023, the HOT/OSM mapped building polygons, and the USGS earthquake catalog that the quake watcher replays. All of those describe a historical event, not a live one.

Synthetic: every user in `data/seed.json`, the shelters and their bed counts, the tweets in `data/tweets_replay.json` (written for the exercise, with a placeholder phone number), and the five scenario cues in `data/scenarios/`. The scenario player sends them through the same event API a person would use. No automated damage classifier was trained or run. The building polygons are community annotations for a person to look at, and the pilot doc in `docs/` says so in full.

## Known limits

- The keeper handles six event types: `report`, `answer`, `approval`, `incident`, `need` and `claim` (`HANDLED` in `workers/memory-keeper.ts`). `closure`, `capacity`, `alert`, `correction` and `plan` events are accepted and stored, then stay `pending`. No code writes roads or zones, and shelters come from `npm run db:seed`. The `file_closure`, `file_capacity` and `correct_record` tools and the sheet and satellite workers post events that wait for those handlers. The sheet, road and shelter numbers on screen are seed data until they land.
- One Brain, one process. A crash costs a few seconds before the lease expires. It does not scale across machines.
- The rate limits are in memory per server process, so a restart clears them.
- The personal agents read a copy of the board that refreshes when `bumpDeskVersion()` changes, so an agent can be one event behind.
- Two metrics, `agent_fidelity` and `triage_order`, have no ground truth and show `unknown`. `coverage` needs people's coordinates from `GET /api/users`.
- The checks that need MongoDB run by hand, not in CI. Phone masking covers the number formats in `agents/shared/privacy.ts` only.
- Priority is `10 x support + minutes waiting + NASA terms`. We picked the weights and have not validated them against real outcomes.

## Where to look

| Question | File |
|---|---|
| What shapes does the data have? | `lib/types.ts`, runtime checks in `lib/schemas.ts` |
| How does anything enter memory? | `postEvent()` in `lib/db.ts` |
| Which site does a report belong to? | `lib/rules/merge.ts` |
| Why is this site ranked first? | `lib/rules/priority.ts`, `scoreParts` on the record |
| Who gets this task? | `lib/rules/assign.ts`, `createTask()` in `workers/dispatcher.ts` |
| What changes a record? | `apply()` in `workers/memory-keeper.ts` |
| What happens when nobody answers? | `workers/sweeper.ts`, `timedOut()` and `checkIn()` in `workers/dispatcher.ts` |
| Why only one Brain? | `acquireLease()` in `workers/brain.ts` |
| Who is calling the API? | `resolveCaller()` in `lib/auth.ts`, `lib/localDemo.ts`, `middleware.ts` |
| What can an event post and who may post it? | `app/api/events/route.ts`, `authorize()` |
| What does a personal agent see and do? | `agents/personal/turn.ts`, `agents/personal/tools.ts`, `agents/personal/prompts.ts` |
| How do agents reach the desk without a database? | `agents/desk/index.ts` and its `DeskPort` |
| How do tweets and news become events? | `workers/x-agent.ts`, `workers/news-agent.ts`, `agents/research/` |
| How does the demo replay run? | `workers/scenario-player.ts`, `docs/scenario-player.md` |
| What does the board poll? | `app/api/board/route.ts`, `components/map/usePolled.ts`, `components/LiveBoard.tsx` |
| Where do the chat charts come from? | `components/metrics/` (`registry.ts`, `compute/`), `docs/frontend/METRICS.md` |
| What does the API look like to a client? | `app/api/README.md`, `lib/openapi.ts` (served at `/api/docs`), `api_front_back_gap/API.md` |
| Which screen decisions were made and why? | `docs/frontend/DECISIONS.md`, `docs/frontend/LOG.md` |
| What is still open between backend and frontend? | `api_front_back_gap/GAPS.md` |

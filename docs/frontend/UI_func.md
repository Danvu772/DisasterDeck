# UI functionality

Every screen, what a person can do on it, what each control calls, the states it shows, and where it moves. Written for design iteration: change the look freely, but keep the behaviour listed here. Checked against `main` at `77c014d`, 15 Nov 2026.

How to change the look: colours, fonts and radii are tokens in `app/globals.css`, used through `components/encode.ts`. `npm run check:tokens` fails on a raw colour or a Tailwind palette colour in `app/` or `components/`. `/lab` shows every primitive in every state, so a token change can be checked in one place.

## Everywhere

- **Nav bar** (`Nav.tsx`): Desk `/`, Map `/map`, Coordinator `/coordinator`, Field `/field`, Agent `/agent`, plus `/lab`. The v2 screens have their own bar (`v2/ui.tsx`): Board `/v2`, Coordinator, Field phone, Volunteer.
- **Account** (`Account.tsx`): shows who is signed in, and a **Sign out** button.
- **Queue pill** (`StatusPill.tsx`): polls `GET /api/health` every 5 s. Shows how many events are waiting and how old the oldest is. Red when the oldest waits too long.
- **Live or demo label:** every polling screen starts from fixtures and says "Demo data" until its endpoint answers, then switches to live. A failing endpoint is asked every 10 s, a working one every 1 s.
- **Who is acting:** role pages pick the person from `?user=` or a default (`field-alpha`, `coordinator-duty`, `volunteer-callback`). They do not read the signed-in session yet, see Known gaps.

## `/` Desk (the shared board)

Route `app/page.tsx`, built from `LiveBoard.tsx`. Polls `GET /api/board` (1 s) and `GET /api/events?limit=30` (2 s).

- **Priority list** (`board/BoardList.tsx`): one list sorted by tier, then score. Filter chips: All, Incident sites, Needs, Shelters, Roads, Tasks. Each row shows tier colour, score, source and age.
- **Board map** (`board/BoardMap.tsx`): the same markers as `/map`, NASA zones underneath. Selecting a record flies the map to it (`flyTo`). The map fits all records on load (`fitBounds`).
- **Desk feed** (`board/DeskFeed.tsx`): every event entering the desk, newest first. Clicking an entry opens its report (`event/EventReport.tsx`, **Back to feed**).
- **Detail panel** (`detail/DetailPanel.tsx`): everything known about the selected record: fields, Sources, Linked records, Actions taken, History, a small map. **Close** hides it. At md and up it is the right column, and below md it overlays.
- **People strip** (`board/PeopleStrip.tsx`): a pill per person. Each one opens that person's agent page.
- **Ask the desk** (`AskDesk.tsx`): question box, placeholder "How full is Shelter B?", button **Ask**. Posts `POST /api/chat?user=`. Read only.

## `/map`

Route `app/map/page.tsx`, built from `map/DeskMapView.tsx`. Polls `GET /api/board`. `/map?focus=site:<id>` opens with that record selected.

- **List on the left, map on the right** (USGS Latest Earthquakes layout). Clicking a row or a marker selects it in both and flies there.
- **Only list what is in the map area:** a toggle chip.
- **Critical outside this view:** a chip with a count, shown when critical records are off screen. Clicking it fits the map to them. The map never moves by itself.
- **Legend:** tier colours, shapes (site, incident, shelter, road), confidence outline, stale fade, NASA hatch patterns. Collapses behind a **Legend** button on a phone.
- **NASA evidence and atlas** (`map/NasaEvidence.tsx`, `map/NasaAtlas.tsx`): satellite frames, quality limits, demo cells, **Show whole city area**. Zones come from `/data/zones.geojson`, the atlas from `/data/nasa-atlas/atlas.json`.
- **Marker encoding:** size means how many people reported it, fill means tier, outline means confidence, fade means stale.

## `/coordinator`

Route `app/coordinator/page.tsx`, built from `coordinator/CoordinatorDesk.tsx`. Polls `GET /api/board`. Acts as `?user=` or `coordinator-duty`.

- **Waiting for your decision** (`ApprovalCard.tsx`): each task waiting for approval shows confidence, sources, and how long it has waited. It turns red when it waits too long.
  - **Approve** and **Reject** post `POST /api/events?user=` with `{ type: "approval", payload: { taskId, approved } }`.
  - **Modify** opens a person picker, "Send someone else". It is not wired: the card says "Modify is not wired to the API yet."
- **Nobody fits these tasks:** escalated tasks.
- **Handed out without you:** low-risk tasks the dispatcher assigned.
- **Problems in the field:** open incidents, what the desk already did, severity first.

## `/field` (field team phone)

Route `app/field/page.tsx`, built from `field/FieldPhone.tsx`. Polls `GET /api/board`. Acts as `?user=` or `field-alpha`. Built for one thumb and a bad network.

- **Current task:** title, place, people, case number. **Details** and **Hide details** show the task's status, priority, risk, deadline and history.
- **On our way:** asks "How long until you get there?" with ETA buttons, then posts `answer` with `result: "accepted"` and `etaMinutes`.
- **Arrived:** posts `answer`, `result: "accepted"`, `etaMinutes: 0`.
- **Done:** a note box, then **Send done**, which posts `answer` with `result: "done"`.
- **Problem** (red): Vehicle, Road blocked, Can't find it, Other. Posts `incident` with the task id, `canContinue: false`, and the phone's position when the browser gives it.
- **Outbox** (`field/useOutbox.ts`): a post that fails on the network is kept in local storage and retried every 10 s. The phone shows "N reports waiting to send".
- **Hold to talk** (`field/useHoldToTalk.ts`): hold the big button and speak. The browser turns speech into text and posts `POST /api/chat`. It needs HTTPS or localhost.
- **Cancel** closes any panel.

## `/agent` (one person and their agent)

Route `app/agent/page.tsx`, built from `AgentDesk.tsx`. Polls `GET /api/board`.

- **Talk as:** a demo row of chips, one per fixture person.
- **Desk feed (left):** everything entering the desk.
- **Your agent (right):** chat history, input "Tell your agent", **Send**. Posts `POST /api/chat?user=`. When the route cannot be reached it shows a stub reply, labelled "Stub agent".
- **Your tasks:** task cards (`TaskCard.tsx`) with **Accept**, **Decline**, **Done** and **Problem**. Each posts an event directly. Problem is the only red button in the app.
- **Your needs** (`YourNeeds.tsx`): what this person asked for, its status, and "N of 3 requests" while it is proposed.

## `/compare` (pitch opening)

Route `app/compare/page.tsx`. "Today vs. with the desk". It uses the same five tweets on both sides.

- **Today** (`compare/TodayTable.tsx`): a plain sheet. The last two columns are empty on purpose.
- **With the desk** (`compare/DeskHalf.tsx`): merged sites, each with an owner line. It uses fixture sites and says so.

## `/login`

**Sign in with SSOJet**: one button for Google, Microsoft and agency sign-in. Errors show as an alert (Configuration, AccessDenied, Verification). In demo mode a link offers "Continue without signing in". Signing in currently returns to `/`, not to the person's role screen.

## `/lab`

Every primitive in every state, from fixtures: record cards, tiers, confidence, stale, chips, buttons, and the metric chart demo (**Change the numbers**). New screen ideas go in `app/lab/<name>/page.tsx`.

## `/board`

Redirects to `/`. Old links still work.

## v2 screens

These are a separate set, under `/v2`. They start from the fixture desk and poll `GET /api/board` and `GET /api/events`. With `?demo=1` they stay on fixtures and never poll.

- **`/v2` board** (`v2/BoardV2.tsx`): situation tiles, one priority list with a filter, a map (`v2/V2MapView.tsx`, `flyTo` and `fitBounds`), the desk feed, and the selected record.
- **`/v2/coordinator`** (`v2/CoordinatorV2.tsx`): decisions first, with **Approve**, **Reject** and **Change who**. Then what the dispatcher did, problems, and the shift handoff. Posts `POST /api/events` and `POST /api/chat`.
- **`/v2/field`** (`v2/FieldV2.tsx`): one task, **On our way**, **We arrived**, **Done here**, a red **Problem**, **Cancel**, and a hold-to-talk button.
- **`/v2/volunteer`** (`v2/VolunteerV2.tsx`): the next call as one big card with **I take it**, **Can't take it** and **Done**. Beside it, the person's agent with "Tell your agent what happened, in any language" and **Send**.

## Shared pieces

| Piece | What it shows |
|---|---|
| `components/ui/` | The shared library. `Skeleton` and `SkeletonLines` (grey loading blocks), `MapSkeleton` (a map frame), `BoardSkeleton` (the desk in its grid, no layout shift). Add a new piece as its own file and export it from `index.ts` |
| `RecordCard.tsx` | The one card for sites, needs, roads, shelters and incidents. Tier bar, confidence border, status, source and age |
| `BoardCards.tsx` | One renderer per record type. A site card shows "N posts from N people", "Automated, not yet seen by a person", and post text when the API sends it |
| `TaskCard.tsx` | Accept, Decline, Done, Problem. Works without the model |
| `Stamp.tsx` | "IG, 4 min ago". Fades and says "stale" past the per-type threshold |
| `History.tsx` | Who changed it, when, why |
| `EventRow.tsx` and `event/EventReport.tsx` | One event: who sent it, what came in, what the desk did |
| `ChatLine.tsx` | One chat line. The bold label is "Agent" or the person's name |
| `metrics/charts/*` | Bars, Gauge, Matrix, Snapshot and MetricCard. Bars grow in on first paint |

## Motion

Every motion is a single pass and stops by itself, except the loading sweep, which loops only while a loading block is on screen. `prefers-reduced-motion` turns off the map motions and the sweep, and leaves the grey blocks and the end state on screen.

| Where | Motion | Trigger |
|---|---|---|
| Loading blocks (`components/ui`) | Light sweep across grey blocks, 1.4 s, loops | While the desk waits on the database (`app/loading.tsx`), while the map chunk loads, and until the first poll answers |
| `/map` marker | One red ring, 1.2 s | A critical site or incident that is new since the first live board |
| `/map` marker | One focus flash, 600 ms | The record opened with `?focus=` |
| `/map` zones | Fade in, 300 ms | The zone layer appears |
| `/map`, board map, v2 map | Fly to the record (0.4 s) | A row or marker is picked |
| Board map, v2 map | Fit all records | First load |
| Metric charts | Bars and gauges grow in | First paint |

## What each control calls

| Call | From |
|---|---|
| `GET /api/board` | Desk, map, coordinator, field, agent, v2 screens |
| `GET /api/events?limit=30` | Desk feed, v2 board |
| `GET /api/health` | Queue pill |
| `POST /api/events` | Task buttons, approvals, field outbox, v2 coordinator |
| `POST /api/chat` | Ask the desk, agent chat, hold to talk, v2 coordinator and volunteer |
| `/data/zones.geojson`, `/data/nasa-atlas/atlas.json` | Map, NASA evidence |

## Known gaps that change what a screen can show

- **Sites that arrived before the dispatcher had no tasks.** The dispatcher makes tasks for new changes (`dispatch:check` passes), but it never looked back at records that were already on the desk, so those sites sat with no call task. `npm run dispatch:backfill` replays them once through the same rules. Until it runs on a desk, that desk's older sites have no tasks and their task buttons have nothing to act on.
- **Chat answers 502 on this laptop.** `ANTHROPIC_API_KEY` is not set, so Ask the desk, the agent chat and hold to talk get an error.
- **No inbox badge and no live people picker.** `GET /api/inbox` and `GET /api/users` are not on `main`.
- **Modify is not wired.** The approval contract accepts an assignee, but nothing applies it yet.
- **Screens ignore the signed-in session.** They act as `?user=` or the default person, while the server acts as the session. When those differ, the screen shows someone else's tasks.
- **Sign-in lands on `/`,** not on the screen for the person's role (t10).
- **The field outbox drops a report on a 404.** It counts 404 as a final refusal, so a report sent while the server is restarting is lost.
- **The agent page knows 4 of the 9 seeded people.** A signed-in person outside those four falls back to the first fixture person.

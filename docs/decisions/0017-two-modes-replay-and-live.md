# D-0017 Two desk modes: replay and live

| | |
|---|---|
| Date | 18 Nov 2026 |
| Status | accepted |
| Decided by | Dan |

## Context

What a viewer sees on the demo today is almost all synthetic, and not because the Brain is fake. Four things stack up:

1. **Prod runs no feeds.** The Vultr VM runs two services, `desk-web` and `desk-brain`. No worker that posts events (X agent, news agent, quake watcher, satellite watcher, sheet sync) runs there. Each one is a CLI someone starts by hand from a laptop.
2. **The screens fall back to fixtures.** `/ops` replays `fixtures/opsPosts.ts` on a 1.6 s timer until the desk has 5 real events (`components/ops/useOpsFeed.ts`). `/coordinator`, `/field`, `/demo` and the board start from `fixtures/board.ts` and `fixtures/field.ts`. Several components import a fixture user list outright.
3. **The demo feeders are synthetic by design.** `workers/synthetic-feed.ts` loops `data/tweets_replay.json` (5 made-up tweets) with mock extraction, toggles roads, nudges shelter counts and spawns a fresh trapped report next to any idle volunteer. `workers/scenario-player.ts` posts 5 scripted cues (blankets, shelter filling, road closure, truck breakdown, repair).
4. **Five workers, five replay mechanisms.** The X agent replays a file at `--speed`. The quake watcher replays the USGS catalog and writes a scenario clock to a **local file** (`agents/.replay/clock.json`), which only processes on the same disk can read. The news agent reads saved fixtures. The satellite watcher reads a cached GeoJSON. Nothing starts them together, nothing shares one clock, and nothing empties the desk first.

Status of each source:

| Source | Replay today | Live today | Real data? |
|---|---|---|---|
| X / Twitter | `workers/x-agent.ts` replays 43 real archived Antakya posts (`data/replays/antakya-real-tweets.json`, 168 s span) through gpt-oss extraction | **Not built.** No X API client exists anywhere in the repo | Archive is real. Live needs a paid X API tier and a written agency policy |
| Official feeds (NWS, FEMA, USGS) | Saved fixtures | `news-agent.ts --live` fetches the real APIs | Real, but NWS and FEMA are US feeds: they say nothing about Antakya |
| Quakes (AFAD, USGS) | Real Feb 2023 USGS catalog | `quake-watcher.ts --live` polls both every 60 s | Real. Posts `alert` events only with `QUAKE_ALERT_EVENTS=1`; off by default |
| Satellite (NASA Black Marble, POWER) | Cached `public/data/zones.geojson` | **Not built.** No live fetch | Real, precomputed |
| Shelter sheet | n/a | `sheet-sync.ts` polls a Google Sheet | Real when a sheet and creds exist. None configured on prod |
| Synthetic feed, scenario player | Always synthetic | n/a | No |

## Decision

A desk runs in exactly one of two modes, stored on the desk, read by everything.

- **Replay.** The desk empties, then a recorded disaster plays into it through the real event API over a set duration. Everything on screen came through `postEvent()` → keeper → dispatcher, exactly as it would live.
- **Live.** Workers poll real sources and post what they find. No timeline, no wipe.

There is no third mode. Screen fixtures, the synthetic feed and the scenario player leave the demo path.

### 1. Mode and clock live in `meta`, not on disk

One document per desk, `meta` `_id: "mode:<deskId>"`, written only by the feeds worker (§4.2: `meta` is Brain-owned today; this adds the feeds worker as writer of its own `mode:` documents only):

```ts
type DeskMode =
  | { mode: "live" }
  | { mode: "replay"; replayId: string;          // which timeline
      runId: string;                              // fresh per start, scopes dedupeKeys
      scenarioStart: string;                      // ISO, T0 of the recording
      wallStart: string;                          // ISO, real time playback began
      speed: number;                              // scenario seconds per real second
      durationS: number;                          // real seconds the whole replay takes
      state: "wiping" | "playing" | "paused" | "done";
      cursor: number; pausedAt?: string };        // index of next timeline entry
```

`deskNow(deskId)` in `lib/` reads it: live → `Date.now()`; replay → `scenarioStart + (now − wallStart) × speed`. The quake watcher's file clock, the client's guessed clock in `components/clock.ts` and the personal agents' `scenarioNow()` all switch to it. `/api/board` returns the mode and `deskNow` so screens stop guessing.

### 2. One timeline file per replay, built offline

`data/replays/<replayId>/timeline.jsonl`, one line per event, sorted by `atS` (seconds after `scenarioStart`):

```json
{"atS": 3120, "event": {"type": "report", "source": "x", "actor": "x-agent", "observedAt": "2023-02-06T11:52:00Z", "payload": {…}}, "origin": {"kind": "historical-real-tweet", "id": "1622…"}}
```

A build script (`scripts/build-replay.ts`) merges the sources into it once:

- the 43 real posts, **extracted once** by the same `extractTweet()` and the model named in the header, so a replay is deterministic, free and runs with OpenRouter down;
- the USGS catalog as `alert` events of kind `quake` (this needs the `quake` alert kind the quake watcher has been waiting on, so it is part of this change);
- the satellite zones as `alert` events at their `observedAt`;
- the Antakya shelters as `capacity` events at T0, so shelters arrive on the board through the keeper like everything else.

Every line keeps its `origin`. A synthetic line is marked `synthetic: true` and the default timeline has none. The scenario player's five cues ship as a separate opt-in timeline (`antakya-drill`) for tabletop exercises. They never mix into the real one: a timeline is either all real lines or all synthetic, and the build script refuses a mix.

The header (first line) holds `replayId`, `scenarioStart`, `scenarioEnd`, the extraction model and a hash of every source file, so the evaluator can rebuild it and compare.

### 3. Starting a replay empties the desk, not the database

`POST /api/desk/mode {mode: "replay", replayId, durationS}`. Any signed-in end user may call it: a replay is something a person starts, never a timer or a worker. The route refuses on a desk flagged `pilot: true` (a real agency desk), whatever the caller's role. The route only writes the request; the feeds worker then:

1. sets `state: "wiping"`; screens show "Resetting desk" and the Brain skips this desk's events;
2. runs `wipeDesk(deskId)` from `lib/reset.ts`: events, sites, needs, roads, shelters, zones, incidents, tasks, inbox, messages and the desk's counters go;
3. reseeds **users only**. People must still be able to sign in and be dispatched; no shelter, site or need is seeded;
4. sets `wallStart = now`, `speed = (scenarioEnd − scenarioStart) / durationS`, `state: "playing"`, `cursor: 0`.

Dropping the whole database is not on the table. One database holds every desk, the users, the Brain lease and the audit log (D-0014). Wiping it from a button would also wipe prod. A replay is always per desk.

The board is empty when step 4 starts, and fills only from the timeline.

### 4. One feeds worker runs both modes

`workers/feeds.ts` replaces `synthetic-feed.ts`, `scenario-player.ts` (as a runner) and the replay flags of the X, news, quake and satellite workers. It is the third service next to web and Brain (a third systemd unit on Vultr today, a third Fargate service after D-0002).

Every second it reads `mode:<deskId>`:

- **replay, playing:** post every timeline entry with `atS ≤ (now − wallStart) × speed` past `cursor`, through `postEvent()`, `dedupeKey = replay:<deskId>:<runId>:<line>`, `observedAt` = the recorded time. Advance `cursor`. At the end, `state: "done"`; the desk stays as it is for questions.
- **replay, paused:** nothing. Resume shifts `wallStart` by the pause.
- **live:** run the live pollers on their own intervals (quakes 60 s, official feeds 5 min, sheet 30 s when configured). X stays off until a live X client and an agency policy exist.

`dedupeKey` carries `runId`, so a second replay of the same timeline is a fresh run, and the unique index never folds it into the last one.

### 5. Timers follow the desk clock

The sweeper's no-answer, missed-ETA and stale-fact timers read `deskNow(deskId)`, not `new Date()`. At 30× a 10 min no-answer timeout fires after 20 real seconds, which is what a compressed replay should look like. Live mode is unchanged because `deskNow` is real time there.

### 6. Screens show the mode and nothing they did not read

- A banner on every screen: `Replay · Antakya 6 Feb 2023 · 11:52 scenario time · 14:10 of 30:00` with Pause and Stop for any signed-in user, or `Live`.
- Fixture fallbacks go: an empty desk renders the empty state, a failing API renders the error state. Fixtures stay for tests and Storybook-style previews only.

### 7. Nobody answers in replay unless someone is there

The dispatcher still creates tasks and asks coordinators. In an unattended replay nobody accepts, so tasks time out and escalate on the compressed clock. That is the honest picture and stays. Seeded people on screen can work the replay by hand; that is how a tabletop runs.

## Consequences

- The demo becomes real data end to end: 43 real posts, the real USGS sequence, real NASA zones, through the real Brain.
- One more service to run and deploy (feeds), one more `meta` writer, one new API route, one new alert kind.
- `synthetic-feed.ts` and the screen fixture fallbacks are deleted. The scenario player survives only as the `antakya-drill` timeline.
- 43 posts across a 168 s archive span is thin. A 30 min replay spends most of its time on quakes and satellite zones. More archive posts are a data task, not a design change.
- Live mode is honest about what is missing: no live X, no live satellite, and NWS/FEMA only matter for a US desk.

## Settled by Dan, 18 Nov

1. **Duration:** default 30 min. The user may pick 10, 30 or 60 when starting. The span of the timeline sets the speed.
2. **Scenario window:** 72 h from the first shock (6 Feb 2023 04:17 local, 01:17 UTC), so both main shocks and the first aftershock days fit. At 30 min that is 144×.
3. **Drill timeline:** the scenario player's five cues stay as the opt-in `antakya-drill` timeline, never mixed into the real replay.
4. **Who starts a replay:** an end user, by hand (`POST /api/desk/mode`). Nothing starts one on its own. Never on a `pilot: true` desk.
5. **Live X:** out of this change. It moves to the later data job (more archive posts, then a live X client with an agency policy).

# D-0017 Synthetic sources, one demo scenario, inputs rebuilt from scratch

| | |
|---|---|
| Date | 18 Nov 2026 |
| Status | accepted |
| Decided by | Dan |

## Context

Everything under the event queue grew one worker at a time: an X agent with LLM extraction, a news agent on US feeds, a quake watcher with a clock in a local file, a satellite watcher, a sheet sync, a scenario player, a synthetic feed and six screen fixture files. They have five replay mechanisms between them. Prod runs none of them, so the demo shows client-side fixtures. Real data on hand is thin (43 archive tweets, most from day 4).

Dan's call, 18 Nov: wipe everything below the queue and start again. For this phase, every input is synthetic, built to look like the real sources we will plug in later.

## Decision

### 1. What stays and what goes

**Stays (the queue and everything above it):** `postEvent()` and `POST /api/events`, the Brain (keeper, dispatcher, playbook, sweeper), `lib/rules/`, the API, personal agents, screens, map layers and imagery, the contact directory, `data/seed.json` users.

**Deleted:**

| Path | Was |
|---|---|
| `workers/x-agent.ts`, `news-agent.ts`, `quake-watcher.ts`, `satellite-watcher.ts`, `sheet-sync.ts`, `scenario-player.ts`, `synthetic-feed.ts` | Every input worker |
| `agents/research/` | X extraction, feed parsers, quake catalog, sheets, search port |
| `agents/fixtures/`, `data/replays/`, `data/tweets_replay.json`, `data/scenarios/` | Every input data file |
| `data/seed.json` shelters | Shelters now arrive through the queue |
| `fixtures/*.ts` imports in `app/` and `components/` | Screen fallbacks. Fixtures stay for unit tests only |
| `scripts/real-replay.test.mjs`, `feeds.test.mjs`, `scenario-player.test.mjs`, `satellite-watcher.test.mjs`, `prepare-real-tweets.py` | Their tests and builders |
| `check:replay`, `check:feeds` in CI | Replaced by `check:scenario` (§6) |

Git history keeps all of it. Real connectors come back later, one source at a time, emitting the same bodies as the synthetic ones.

### 2. Four sources, one wire format

Four synthetic sources, each shaped like the real platform so the swap is a connector, not a redesign:

| Source | `source` | Real thing it stands in for | Voice | Trust |
|---|---|---|---|---|
| X | `x` | Public posts, reposts, hashtags, Turkish, short | One voice per distinct text | public |
| Instagram | `instagram` | Photo posts and stories, geotagged, caption-first | One voice per distinct text | public |
| Facebook | `facebook` | Neighbourhood and relief group posts, long, lists of needs | One voice per distinct text | public |
| AP | `news`, actor `ap` | Wire copy: dateline, headline, urgency, English | One voice | **vetted** (new, §5) |

Every source posts the same JSON any API client posts to `POST /api/events`. One post can carry several events (a report and two needs); each gets its own `dedupeKey` with a suffix. The only addition to the event body is an optional `origin` block that says where the post came from. The keeper stores it with the event and never reads it for rules:

```json
{
  "type": "report",
  "source": "x",
  "observedAt": "2023-02-06T01:58:00Z",
  "dedupeKey": "x:1622018840000000101",
  "origin": { "postId": "1622018840000000101", "author": "@hatay_dayanisma", "kind": "post",
              "url": "https://x.example/hatay_dayanisma/status/1622018840000000101", "metrics": { "reposts": 412 } },
  "payload": { "kind": "trapped", "text": "ACİL! Cebrail Mah. 3. Sokak No:12 Yıldız Apt. 4 kişi enkaz altında, ses veriyorlar. Tel •••••••••41 #deprem",
               "textEn": "URGENT! Cebrail Nbhd, 3rd Street No:12, Yıldız Apt. 4 people under the rubble, they are answering. Phone •••••••••41",
               "address": "Cebrail Mah. 3. Sokak No:12 Yıldız Apt.", "region": "antakya-merkez", "coords": [36.2031, 36.1602], "peopleCount": 4 } }
```

`origin.kind` is `post`, `repost`, `story`, `group_post` or `wire`. Instagram adds `media: [{ "type": "image", "url": "/demo/shelter-whiteboard-2.jpg" }]`. AP adds `{ "slug": "BC-EU--Turkey-Earthquake", "urgency": "urgent" }`.

The synthetic posts arrive already extracted: the scenario author writes the post and its payload together. No LLM runs below the queue in this phase. LLM extraction comes back with the first real connector.

### 3. A fifth track: the cast

The four sources only report. To show dispatch, approval and the help desk unattended, the scenario has a **cast** track: scripted taps by the seeded people (accept, on the way, done, problem, coordinator approve). Cast lines post through the same API with the agent key, naming the seeded user as actor. `lib/auth.ts` already lets a worker name itself, so this needs no new path. The cast only plays on a desk flagged `demo: true` in `data/pilot.json`.

A cast line names its task by the beat that caused it (`"task": { "fromEvent": "x:1622018840000000101" }`). The player looks up the task built from that event at play time. If a signed-in person has already acted on that task, the cast line is skipped: a presenter can take over any person in the story at any time.

### 4. One scenario, one player

`data/scenarios/antakya-demo/` holds one file per track: `x.jsonl`, `instagram.jsonl`, `facebook.jsonl`, `ap.jsonl`, `cast.jsonl`, plus `beats.json`. Each line is `{ "atS": <seconds after T0>, "body": <the POST /api/events body> }` (cast lines use `"as"`, `"do"`, `"task"` instead of `body`). The beats and posts are in [`docs/demo-scenario.md`](../demo-scenario.md).

`workers/player.ts` is the only input worker:

1. A signed-in person presses **Start demo** (`POST /api/desk/demo {action: "start", durationS}`). Nothing starts it on its own. A desk not flagged `demo: true` refuses.
2. The player wipes that desk (`wipeDesk()`), reseeds users only, and writes `meta` `demo:<deskId>` `{ runId, t0, wallStart, speed, state, cursor }`. The board is empty.
3. Every second it merges the five tracks by `atS` and posts what is due through `POST /api/events`, the same door every client uses. `dedupeKey` gets `:<runId>` appended, so a rerun is fresh.
4. Pause, resume and stop go through the same route. At the end the desk stays as it is.

Default length 30 min for 36 h of scenario (72×). The desk clock `deskNow(deskId)` reads `meta`, and the sweeper, personal agents and screens use it. A banner on every screen shows `Demo · Antakya exercise · Day 1 06:40 · 09:15 of 30:00` with Pause and Stop.

There is no live mode in this phase. It comes back with the first real connector.

### 5. One Brain change: AP is vetted

Today the keeper gives `news` public trust, so an AP wire story counts the same as one anonymous post. Wire copy is edited and sourced. `eventTrust()` gives `source: "news"` **vetted**. Without it, the corroboration beats (AP confirms a closure, AP debunks a rumour) show nothing.

### 6. Beats are tests

`beats.json` lists every beat with what the board must show after it (`expect`: counts, a record's status, a task's state). `npm run check:scenario` plays the whole scenario at 1000× on a throwaway desk and checks every beat in order. It runs in CI against Mongo. The demo script and the regression test are the same file.

## Consequences

- About 2,700 lines of input code and nine data files go. One worker and one scenario folder replace them.
- The demo is entirely synthetic and says so on screen. No real disaster data is shown as if it were live.
- Every Brain capability has a beat that exercises it, and CI proves the beat still lands.
- Adding a real source later means one connector that emits the same bodies as its synthetic track; the synthetic track stays as its test.
- Lost for now: LLM extraction of raw posts, the satellite silent-zone and cold alerts, aftershock warnings in personal agents, the sheet sync, and live mode. Each returns as a connector when needed.

## Settled by Dan, 18 Nov

1. **Setting:** Antakya, synthetic, modelled on 6 Feb 2023. The map imagery stays.
2. **AP is vetted** (§5).
3. **The cast** (§3) goes in as designed, on `demo: true` desks only (orchestrator's recommendation; Dan said go on the whole design).

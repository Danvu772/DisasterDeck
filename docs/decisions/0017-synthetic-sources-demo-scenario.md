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

The four sources only report. To show dispatch, approval and the help desk unattended, the scenario has a **cast** track: scripted taps by the seeded people (accept, on the way, done, problem, coordinator approve). Cast lines post through the same API with the agent key, naming the seeded user as actor. `lib/auth.ts` already lets a worker name itself, so this needs no new path. The cast only plays while the deployment is in demo mode (`demo: true` in `data/pilot.json`).

A cast line names its task by the beat that caused it (`"task": { "fromEvent": "x:1622018840000000101" }`). The player looks up the task built from that event at play time. If a signed-in person has already acted on that task, the cast line is skipped: a presenter can take over any person in the story at any time.

### 4. One scenario, one player

`data/scenarios/antakya-demo/` holds one file per track: `x.jsonl`, `instagram.jsonl`, `facebook.jsonl`, `ap.jsonl`, `cast.jsonl`, plus `beats.json`. Each line is `{ "atS": <seconds after T0>, "body": <the POST /api/events body> }` (cast lines use `"as"`, `"do"`, `"task"` instead of `body`). The beats and posts are in [`docs/demo-scenario.md`](../demo-scenario.md).

The demo is **global**: one deployment, one demo, one button. There is no per-desk demo state.

1. **Start demo** sits in the shared header on every screen while the deployment is in demo mode (`demo: true` in `data/pilot.json`). Any signed-in person can press it; pressing it again restarts the demo from zero.
2. The button calls `POST /api/demo/start`. **The route preps Mongo itself:** it writes `meta` `demo` `{ state: "prepping" }`, waits up to 10 s for the Brain to finish any event it is working on, deletes every desk's records (events, sites, needs, roads, shelters, zones, incidents, tasks, inbox, messages, desk counters), reseeds the users from `data/seed.json`, then writes `meta` `demo` `{ state: "playing", runId, startedAt, durationS }`. Users' logins, the Brain lease and the audit log are untouched. The route is the only writer of the `demo` document.
3. `workers/player.ts`, the only input worker, holds no state of its own. Once a second it reads the `demo` document, works out how far into the scenario it is, and posts every line whose `atS` is due through `POST /api/events`, the same door every client uses. `dedupeKey` gets `:<runId>` appended, so a restart is a fresh run and a player restart re-posts nothing new.
4. While `state` is `prepping`, the Brain and the player do nothing.

Default length 30 min for 36 h of scenario (72×). The demo clock `demoNow()` is `T0 + (now − startedAt) × speed`, or real time when there is no `demo` document. The Brain (keeper, dispatcher, sweeper), the personal agents and the screens all read it. The header shows `Demo · Antakya exercise · Day 1 06:40 · 09:15 of 30:00` beside the button.

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

## Amendment, 18 Nov (from the build plans for #51 and #53)

Planning found gaps. This amendment closes them.

1. **Start is global and simple** (§4 rewritten, Dan's call). One header button, one `meta` `demo` document written only by the route, a stateless player, no pause. This replaces the per-desk demo state and the `POST /api/desk/demo` actions.
2. **A cast line acts as whoever the rules picked.** `as: "assignee"` means the person the dispatcher assigned the task to. A person's own report, correction or approval names the seeded user. The rules keep choosing who goes where (invariant 3), and each beat asserts who got the task instead of scripting it.
3. **The demo clock reaches the whole Brain.** Keeper scoring and age, dispatcher deadlines and ETAs, and sweeper timers all read `demoNow()`. With no `demo` document it is `Date.now()`, so live behaviour does not change. #52 grows to cover this.
4. **Beats were rewritten to land on today's Brain** (`docs/demo-scenario.md`). Nothing routes placements, silence alone never escalates, hazards live on sites, and a coordinator cannot clear a hazard field. The beats now show what the rules really do. The seed suppliers stock insulin, tents and heaters.
5. **Bug: a public `rescued` report lowers a site's `peopleTrapped`.** That lets one social post change a life-safety record, against §5.2 ("a social post alone can never approve, close or cancel anything"). Fix: only a trusted voice changes `peopleTrapped`. Beat 15 depends on it (#56).
6. **`check:scenario` runs on virtual time** (`V = T0 + atS`, Brain drained after each line, sweeper ticked about every 30 virtual seconds). This is the pattern `sweeper-check` already uses. The wall-clock player is tested separately by DEMO-3.

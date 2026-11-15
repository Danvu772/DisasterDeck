# To Darshal (Role 1): roads, shelter counts and hazards from the research agents

From Role 2 (Ömer), 15 Nov 2026. Nothing here touches your files; these are requests. Agent side is merged in `628abb0`.

## What the agents send now

| Event | Sent by (`actor`, `source`) | Example payload | `dedupeKey` |
|---|---|---|---|
| `closure` | `x-agent`, `x` | `{ road: "Malatya–Elazığ highway", state: "closed", reason: "rubble near Kale bridge (tweet)", coords? }` | `x:<tweet id>:closure:<n>` |
| `closure` | `news-agent` / `official-agent`, `news` | same shape, reason ends in `(news)` | `news:<hash>` / `official:<hash>` |
| `capacity` | `x-agent`, `x` and the news agents | `{ shelter: "Battalgazi sports hall", bedsUsed: 400, bedsTotal: 400 }` | `x:<tweet id>:capacity:<n>` |
| `report` with a hazard | `x-agent`, news agents | `textEn` starts with `[Hazard: strong gas smell at the site]` | as before |

A capacity is only sent when the post gives numbers ("full, 400 people" → 400/400, "150 tents, 20 free" → 130/150). "It is full" with no number is logged and dropped. Every payload passes your `eventBody` schema before it is posted.

## What we need from the backend

1. **Keeper handlers for `closure` and `capacity`.** `HANDLED` on main is `report, answer, approval, incident, need, claim`. Until these two are in, the events stay `pending` and nothing reaches the map, the board or the agents. Suggested rules:
   - `closure` → `roads`: same road = same normalized name (your `normalizeAddress` fold works) or within ~300 m. The newest `observedAt` sets `state`. Confidence: one public source (`x`) = `unconfirmed`, two different sources = `corroborated`, `official-agent` or a person on the desk = `confirmed`.
   - `capacity` → `shelters`: match by normalized name. A newer `observedAt` replaces the numbers; an older one only goes into `history`. An unknown name creates a shelter (see 3 for its position).
2. **`hazard?: string` on `ReportPayload`** (`lib/types.ts` and `reportPayload` in `lib/schemas.ts`). The keeper copies it to `Site.hazard` when it is set, without wiping a hazard an `unsafe` incident set. The frontend already shows `Site.hazard` (v2 board, detail panel) and the dispatcher already puts it in the task text, so this is the only missing link. When the field exists, the agents switch from the `[Hazard: …]` text prefix to the field (one line on our side).
3. **`coords?: LatLng` and `region?: string` on `CapacityPayload`.** Without them a shelter first seen in a post has no position and cannot go on the map. The agents will fill them from the post's geocode.
4. **Dispatcher: warn a task about a closed road near its place.** If a `deliver`, `rescue` or `evacuate` task's place is within ~1.5 km of a road that is not `open`, add one line to the task detail or an inbox notice ("Kernek road closed 600 m from the site, tweet, unconfirmed"). The personal agents now say this in chat; this would put it on the task card too.

## Small frontend items found on the way (for whoever owns them)

- `components/BoardCards.tsx`: shelter cards always say source `"instagram"`, road cards always `"person"`. Read it from the record's `history` instead.
- `components/map/mapItems.ts`: road confidence comes from `state`, not from `Road.confidence`.
- `components/map/ZoneLayer.tsx`: zone calls come from the static `zones.geojson`. `agents/research/zone-calls.ts` (`callsByZone`) counts them from the desk's sites if the map wants the live number.

## How to check

```bash
npx tsx --env-file=.env.local workers/x-agent.ts --limit 5   # posts to the real desk (MONGODB_URI)
npx tsx --env-file=.env.local agents/scripts/show-events.ts  # how the Brain handled them
```

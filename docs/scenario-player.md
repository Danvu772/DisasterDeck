# Malatya scenario player

The player sends synthetic exercise observations through the event API. Its five cues reuse the delivered seed and the historical scene of 11 February 2023 at 09:00 Türkiye time. The volunteer, coordinator, field team and suppliers use the app for their live actions. The player supplies unattended reports and explicit presenter fallback cues.

## Run one cue

Use Node.js 22.18+ or 24. From the repository root, list the cues or load the team's existing `.env.local` with `AGENT_KEY`. `BASE_URL` defaults to `http://localhost:3000`. `DESK_ID`, when set, must be `malatya-2023`.

```sh
node workers/scenario-player.ts --list
node --env-file=.env.local workers/scenario-player.ts --run rehearsal-01 --step blankets --dry-run
node --env-file=.env.local workers/scenario-player.ts --run rehearsal-01 --step blankets
```

`--dry-run` reads the board and shows the event that would be sent. A completed cue returns its saved receipt with `replayed: true`. `--wait-seconds` controls how long to wait for a prerequisite, default 30 seconds. `--delay-seconds` schedules one unattended cue after a delay. Timing is controlled explicitly for each invocation.

```sh
node --env-file=.env.local workers/scenario-player.ts --run rehearsal-01 --step shelter-filling --delay-seconds 15
node --env-file=.env.local workers/scenario-player.ts --run rehearsal-01 --step truck-breakdown --wait-seconds 60
node --env-file=.env.local workers/scenario-player.ts --run rehearsal-01 --step truck-repaired
```

## Cues and prerequisites

| Cue | Board state required | Event or observed outcome |
|---|---|---|
| `blankets` | Unique Turuncu Avlu site, verified and active, with an accepted or completed high-risk field dispatch for `field-alpha` | A 20-blanket life-threatening need for the actual site ID. If the field team already requested at least 20, the player records that outcome. Use this cue as the unattended field fallback. |
| `shelter-filling` | Seeded Shelter A with the expected name and total capacity of 50 | Capacity 48/50. An equal or fuller shelter already meets the cue. A changed total capacity needs the scenario to be reviewed. |
| `road-closure` | A unique demo road, or its first observation | Closure for the fictional Demo bağlantı yolu. An existing closure already meets the cue. |
| `truck-breakdown` | The primary supplier's unique delivery for the site's blanket need is accepted and open | `vehicle_breakdown`, actual delivery task ID, `canContinue: false`. An existing breakdown is recorded as observed. |
| `truck-repaired` | An actual vehicle-breakdown incident associated with that original delivery | An update with the existing `incidentId`, original `taskId`, `resolved: true` and `canContinue: true`. Use the cue when the presenter confirms the scripted repair. |

The configuration is `data/scenarios/malatya.json`. It contains proposed demo identities, synthetic observation text, locations and a historical observation clock. Offsets 20, 30, 40, 60 and 90 seconds follow the original five-post replay. The receipt timestamp is set by the API as usual. The script's observation dates remain the historical scene's dates.

## Repetition and interrupted runs

Use one stable `--run` value throughout a rehearsal. Each event key includes the desk, scenario version, run and cue. Local prepared actions and receipts are in `data/scenario-state/<scenario>/<run>/`, which is ignored by Git. `SCENARIO_STATE_DIR` can point to another local directory.

Prepared actions bind the real site, need, task and incident IDs before the first POST. Complete files become visible atomically, so concurrent invocations retain the same binding. HTTP retries use the same event and key. After a restart, an observed breakdown remains attached to the original delivery even when replacement work has appeared. The repair cue inherits that original delivery binding and reads the actual incident ID from the board.

An `observed` receipt means the requested state was already visible. A `posted` receipt includes the event ID acknowledged by the API. The next cue checks the board for its own prerequisites while the Keeper and Dispatcher process earlier events.

The journal is bound to the server origin and configuration. Keep the same URL and scenario file for the run. For a clean rehearsal, Role 1 resets and reseeds the demo desk, then the presenter chooses a new run name. Role 1 owns the database reset procedure.

## API handoff

The player uses `GET /api/board?deskId=malatya-2023` and `POST /api/events`, both with the private `x-agent-key` header. The board must return the contract arrays and preserve blocked tasks and incidents. Each returned record must belong to the requested desk. The POST body carries `source: system`, `actor: scenario-player`, `deskId`, `observedAt`, `dedupeKey` and the typed payload.

The event API identifies the authenticated worker and returns `{ id }`. Its unique dedupe index handles a repeated key. The Keeper owns records, and the Dispatcher owns replacement work and notices. Human task acceptance and coordinator approval use the existing app sessions and buttons.

At this delivery, `lib/db.ts` is present. The HTTP routes, Keeper and Dispatcher remain team integration dependencies. The local HTTP tests exercise the published contract, interruption handling and repeatability. Live CP3/CP4 acceptance still needs the actual Brain and role sessions.

## Verification

```sh
node --test scripts/satellite-watcher.test.mjs scripts/scenario-player.test.mjs
node scripts/validate-demo-data.mjs
```

The scenario tests cover seed/clock alignment, field approval gating, actual IDs, existing live reports, stale capacity, foreign desks, ambiguous targets, all five event shapes, retry after a lost response, process restart, competing invocations, normal CLI behavior and configuration binding. The satellite tests cover the shared HTTP sender's existing callers.

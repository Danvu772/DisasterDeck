# Role 4 progress and CP1 handoff

## Work queue

1. **Replay and seed ready for integration.** Five synthetic Turkish posts, nine demo users and three shelters are in `data/`. Local validation passes. The X worker, database loader and live CP1 acceptance remain with Roles 1 and 2.
2. **NASA cache, map and watcher ready for integration.** Two 500 m polygons, source metadata and hashes, a reproducible offline preparation script, regression checks and the event sender are implemented. The real cache yields two cold alerts. Damage and night-light evidence remain unknown because of transparency and saturation. See [NASA evidence](nasa-evidence.md) and [the track requirements audit](nasa-requirements-audit.md). Live priority and approval acceptance still requires Role 1's API and Brain.
3. **Scenario player ready for board/Brain integration.** Five synthetic cues use real board IDs, explicit manual advance, optional delays and durable per-run receipts. Eighteen scenario tests cover site matching, restart, retry and concurrent execution. The tests validate each cue against the POST event schema. See [the runbook](scenario-player.md). Live CP3/CP4 acceptance requires the board endpoint and Brain.
4. **Pitch and submission pending.** The [two-minute demo script](demo.md) is drafted with proposed operator/device assignments. The Devpost draft, operator confirmation, live rehearsal and video recording remain pending. Use verified integrations in the submitted pitch.

## Files and validation

Run from the repository root with Node.js. The command uses built-in modules.

```sh
node scripts/validate-demo-data.mjs
```

The validator checks stable string IDs, replay timing, the repeated case and separate control location, region references, required roles and profiles, supplier stock, shelter capacity and serialized dates. It can also check a prepared copy with `node scripts/validate-demo-data.mjs /path/to/data`.

| File | Consumer | Shape |
|---|---|---|
| `data/tweets_replay.json` | Role 2 X worker | Ordered array of `{ id, text, ts_offset_seconds, coords, region }` |
| `data/seed.json` | Role 1 database setup | `{ deskId, regions, users, shelters }` with `User` and serialized `Shelter` fields from `lib/types.ts` |

All reports, people, contacts, site labels, stock and occupancy are synthetic. Coordinates are approximate Malatya scenario pins in `[latitude, longitude]` order. The public Hugging Face table exposes tweet IDs, labels and entity offsets. Original tweet text needs an additional source before expanding the real-data replay. [Dataset viewer](https://huggingface.co/datasets/ctoraman/deprem-tweet-dataset)

The proposed story uses Ayşe as the person reported trapped and Zeynep as the callback volunteer. The callback numbers `000 000 00 42` and `000 000 00 73` are exercise placeholders. Role-play the call and show `••42` or `••73` on the board.

## Role 2 replay handoff

Read offsets as seconds from playback start. The schedule is 0, 4, 8, 12 and 16 seconds. Use `x:<id>` for `dedupeKey`. Keep IDs unchanged on retries. Set the event `deskId` to `malatya-2023`, copy the fixture coordinates and region into the report payload, and preserve the Turkish text with its English translation.

| Message IDs | Expected extraction | Expected grouping |
|---|---|---|
| `demo-malatya-001` through `004` | `kind: trapped`, address `Turuncu Avlu`, Ayşe, `peopleCount: 1`, coordinates `[38.35, 38.31]` | One site with four source posts |
| `demo-malatya-005` | `kind: trapped`, address `Mor Avlu`, `peopleCount: 2`, coordinates `[38.36, 38.33]` | A separate site, over 100 m from the first |

The first four posts repeat one simulated original call. Keep that provenance when interpreting support or satellite call counts. Record a curated sample count for NASA comparisons. The separate control is another help call so the grouping check exercises two valid sites.

The replay clock starts at zero. The historical reference scene is 11 February 2023 at 09:00 Türkiye time (`2023-02-11T09:00:00+03:00`), after the selected satellite acquisitions. The current X and personal agents timestamp synthetic reports at the exercise time. The scenario CLI follows that convention and preserves the first prepared timestamp on retry. NASA evidence cards carry the products' original dates. The committed shelter seed still has reference-scene timestamps. Before displaying shelter capacity live, refresh the synthetic observations or agree on a seed-clock update with Role 1.

## Role 1 seed handoff

Upsert users and shelters by `_id`. Parse `shelters[].observedAt`, `shelters[].updated` and `shelters[].history[].ts` into `Date` values before insertion. `regions` is lookup metadata. It reserves `malatya-turuncu` and `malatya-mor` for the NASA handoff. Zone measurements still need to be produced.

The shared region key is `malatya-merkez`. Use the same key when matching users, shelters and reports. Refresh `lastSeen` via login or heartbeat during rehearsal. The user IDs below are proposed application IDs. Role 3 must map actual SSOJet identities to them.

| User ID | Demo function |
|---|---|
| `volunteer-callback` | Zeynep receives the callback task |
| `volunteer-mechanic` | Available volunteer with a van and the `mechanic` skill |
| `field-alpha` | Field team for the approved dispatch and blanket request |
| `supplier-primary` | Closest supplier to Turuncu Avlu, truck, 200 blankets |
| `supplier-backup` | Replacement supplier, truck, 120 blankets |
| `shelter-desk` | Shelter A operator |
| `coordinator-duty`, `coordinator-backup` | Two official coordinators for approval and escalation |
| `public-demo` | Public-trust citizen session |

Use a 20-blanket need at Turuncu Avlu for CP3. Both suppliers have sufficient starting stock. The three shelters start at 38/50, 24/40 and 12/30 occupancy.

## CP1 acceptance with the team

- [ ] Role 1 loads the seed and Role 2 reads the replay through the real X worker.
- [ ] After five posts, the board shows one Turuncu Avlu site with four source posts and one Mor Avlu site.
- [ ] Reported people stay at one for Turuncu Avlu and two for Mor Avlu.
- [ ] Replay ID `demo-malatya-001` unchanged and confirm the event ID, site count, source/support counts and task count stay stable.
- [ ] Zeynep receives the callback task. Confirm the full placeholder appears in the permitted task detail and the board shows its masked form.
- [ ] Save the screenshot and Git commit used for the run.

At the initial repository snapshot, `workers/`, `agents/` and `scripts/` contained placeholders and there were no event or board API routes. This delivery provides the inputs and local checks. CP1 acceptance requires the backend and worker implementations.

---
id: t31-scenario-clock
effort: medium
checkpoint: redesign
files: components/encode.ts (ageText, minutesSince, isStale only, after t25 merges), new components/clock.ts
---
# Ages come from the scenario clock, not today's date

Live data from Atlas is stamped February 2023 (the Malatya scenario). Every age is computed against `Date.now()` (14 Nov 2026), so shelters read "counted 1373 days ago" and everything is stale. That is a v1 bug the v2 comparison exposed.

- New `components/clock.ts`: `deskNow()` returns the scenario time. It is the newest `observedAt`/`ts` seen on the board plus the time since the board was fetched, or, when the board carries no timestamps, `Date.now()` (fixtures are built relative to now, so they keep working unchanged).
- Simpler alternative if that is fragile: an optional `NEXT_PUBLIC_SCENARIO_START` (ISO time) that maps page-load time to scenario time. Pick one, say which in your report.
- `ageText`, `minutesSince` and `isStale` use it. Screens keep calling them the same way.
- Acceptance: with the live board, shelters read minutes or hours, not "1373 d". With fixtures, ages are unchanged.

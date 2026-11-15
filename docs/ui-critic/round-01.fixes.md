# Round 01 fixes

| id | Status | Files | Note |
|---|---|---|---|
| nav-links-hidden | fixed | components/Nav.tsx | link strip wraps to its own row below `xl` |
| desk-map-framed-too-wide | blocked: file busy | components/map/gl/DeskGlMap.tsx | uncommitted edits from another session |
| desk-feed-plumbing | fixed | workers/synthetic-feed.ts, agents/research/x-extract.ts, components/EventRow.tsx, components/detail/fields.ts | plain reason text, English placeholder for mock posts, trailing `(#id)` stripped, "News / Shelter sheet / Social post" actor words |
| desk-events-api-500 | skipped: not reproduced | — | dev server on :3123 not answering at fix time (curl 000); recheck in round 02 |
| desk-list-all-red-stale | fixed | components/board/BoardList.tsx, components/Stamp.tsx | done tasks fade and lose the tier badge, child task rows only show it when overdue, "Stale" chip removed (age text still fades) |
| desk-task-title-repeats-place | partly fixed | workers/dispatcher.ts | `titleFor` adds address only with a case number; old tasks keep old titles, no UI dedupe |
| desk-hydration-mismatch | fixed | components/board/BoardList.tsx | `suppressHydrationWarning` on the line span only |
| desk-waiting-minutes | fixed | components/board/BoardList.tsx | uses `ageText` ("waiting 4 h") |
| desk-avatar-badges-overlap | fixed | components/board/PeopleStrip.tsx | `gap-1.5` instead of overlap |
| desk-inbox-401 | fixed | components/InboxBadge.tsx | polling stops after a 401 |
| coordinator-page-not-hydrated | skipped: transient, recheck in round 02 | — | chunks return 200 on re-check |
| coordinator-internal-id | fixed | fixtures/board.ts, fixtures/desk.ts | text says "the backup depot" |
| coordinator-demo-names | skipped | — | renames demo users in seed data; needs a decision |
| map-first-view-empty | blocked: file busy | components/map/gl/DeskGlMap.tsx | same fix as desk-map-framed-too-wide |
| map-markers-over-popup | blocked: file busy | components/map/gl/DeskGlMap.tsx | popup z-index |
| map-list-missing-status | blocked: file busy | components/map/MapScreen.tsx | |
| map-filter-chips-cut | blocked: file busy | components/map/MapScreen.tsx | |
| map-marker-numbers | blocked: file busy | components/map/MapScreen.tsx | |
| field-page-not-hydrated | skipped: transient, recheck in round 02 | — | chunks return 200 on re-check |
| field-no-where | skipped | — | needs address and distance on the task payload; not a style change |
| field-header-clipped | fixed | components/Nav.tsx | route links hidden on `/field` below `sm` |
| volunteer-buttons-before-accept | fixed | components/TaskCard.tsx | Accept + Decline until accepted, then Done + Problem |
| volunteer-title-truncated | fixed | components/RecordCard.tsx | `line-clamp-2` |
| talk-internal-id | fixed | components/detail/fields.ts, RecordCard.tsx, FieldPhone.tsx, app/talk/page.tsx | not removed from the dispatcher string: `PROPOSAL` regex reads the id back on approval. New `plainDetail()` hides it on screen |
| talk-tasks-dup | partly fixed | components/motion/PinnedList.tsx | titles `line-clamp-2`; dedupe skipped (would block unpinning) |

Checks: check:tokens pass; tsc no errors; eslint clean on touched UI files; routes NOT reloaded (dev server on :3123 not answering).
Changed files: agents/research/x-extract.ts, app/talk/page.tsx, components/{EventRow,InboxBadge,Nav,RecordCard,Stamp,TaskCard}.tsx, components/board/{BoardList,PeopleStrip}.tsx, components/detail/fields.ts, components/field/FieldPhone.tsx, components/motion/PinnedList.tsx, fixtures/{board,desk}.ts, workers/{dispatcher,synthetic-feed}.ts

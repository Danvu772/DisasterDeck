# Round 02 fixes

| id | Status | Files | Note |
|---|---|---|---|
| coordinator-page-not-hydrated | fixed (environment: clean dev-server restart, no code change) | — | shared `.next` folder |
| field-page-not-hydrated | fixed (environment: clean dev-server restart, no code change) | — | same cause |
| map-page-not-hydrated | fixed (environment: clean dev-server restart, no code change) | — | same cause |
| volunteer-page-not-hydrated | fixed (environment: clean dev-server restart, no code change) | — | same cause |
| desk-map-framed-too-wide | fixed | components/map/gl/DeskGlMap.tsx | first view frames the desk's own records (hazards left out); box wider than 0.3° falls back to Antakya |
| map-first-view-empty | fixed | components/map/gl/DeskGlMap.tsx | same component, same fix |
| desk-feed-plumbing | partly fixed | components/EventRow.tsx | no source file still writes the old text (grep of fixtures, data, workers, lib, agents, app, components, scripts). `summary()` now hides the old ": simulated news update, pass N" suffix and "[mock, not translated]" prefix. Rows from a running worker: skipped, needs worker restart / old data |
| desk-task-title-repeats-place | fixed | components/detail/fields.ts, components/board/BoardList.tsx, components/RecordCard.tsx, components/field/FieldPhone.tsx, components/motion/PinnedList.tsx | new `taskTitle()` collapses "X, X" to "X" (TaskCard goes through RecordCard) |
| coordinator-demo-names | skipped | — | renames seed users; needs the author's decision |
| map-filter-chips-cut | fixed | components/map/MapScreen.tsx | chip row wraps (`flex-wrap`) |
| map-list-address-unknown | fixed | components/map/MapScreen.tsx | "Site N · address unknown" (N = place in the site list; no desk-list helper existed to reuse) |
| field-no-where | fixed | components/field/FieldPhone.tsx | address under the place name (site records, real addresses only) + outline "Directions" button (Lucide Navigation, maps link by coords or address). Distance not added |
| field-header-clipped | fixed | components/Nav.tsx | conditional class moved last and made `max-sm:hidden` |
| field-zero-min-left | fixed | components/field/FieldPhone.tsx | "Due now" at 0 min; late stays "N min late" in destructive colour |
| volunteer-viewas-cut | fixed | app/agent/page.tsx | strip wraps, chips no longer truncate. Names unchanged (see coordinator-demo-names) |
| talk-tasks-dup | blocked: file busy | components/talk/TalkScreen.tsx | uncommitted edits from another session |
| desk-events-api-500, talk-internal-id, map-markers-over-popup, map-marker-numbers | skipped: not checked in the report | — | nothing to fix this round |

Checks: check:tokens pass; tsc no errors; routes answer 200 on :3123 (/, /map, /field, /agent, /talk); browser console not inspected.
Changed files: app/agent/page.tsx, components/EventRow.tsx, components/Nav.tsx, components/RecordCard.tsx, components/board/BoardList.tsx, components/detail/fields.ts, components/field/FieldPhone.tsx, components/map/MapScreen.tsx, components/map/gl/DeskGlMap.tsx, components/motion/PinnedList.tsx, docs/ui-critic/round-02.fixes.md

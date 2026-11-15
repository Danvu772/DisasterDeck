---
id: t26-board-v4
effort: high
checkpoint: redesign
files: app/page.tsx, components/LiveBoard.tsx, components/BoardTabs.tsx, components/detail/DetailPanel.tsx, components/detail/DetailMap.tsx, new components/board/*
---
# Board: v2's three-pane layout with v1's content

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

Reference: `components/v2/BoardV2.tsx`, `components/v2/V2MapView.tsx` on `origin/redesign/v2`.

**Layout at 1280 px and up, no page scroll for the main thing:** three columns under the header. **List** (about 380 px) | **map** (flexible) | **detail** (about 400 px). The desk feed sits below the map (v2 places it there), scrolling on its own. No headline numbers.

- **Top of the list column:** "Ask the desk" (v1, t12) as a compact field. The people-on-the-desk cards move into a one-line strip of name pills above it (each pill still links to `/agent?user=`). Nothing from v1 is dropped.
- **List:** v1's tabs become v2-style filter chips (`chip()` from encode): All, Incident sites, Needs, Shelters, Roads, Tasks, each with its count and the red act-now count. One list below, v2 row style: the tier badge (mono "T0"), kind and id in mono, the title, then v1's row content (loop step from t14, "4 posts from 1 person" and the automated flag from t03, Stamp age). Incidents stay indented under their site (t21).
- **Map column:** the big map. Reuse `components/map/markers.ts`, `ZoneLayer` and the legend pieces, so markers match `/map`. Clicking a marker selects it.
- **Detail column:** v1's detail panel content (`DetailPanel`, t21: every field, linked records, history, "Open on the full map"), now a fixed column instead of a slide-in panel. Its own small map is gone (the big map pins the selection with the selected ring and flies to it). With nothing selected, select the first act-now item, else show "Pick a record on the list or the map".
- Selection stays in `?open=<kind>:<id>` (t21) so links keep working.
- Below 1280 px: list and detail stack, map above. Phone: list, then a full-screen detail sheet as now (t22 behaviour).
- The queue health line moves to the header pill (t25). Remove it from the board.

Accept when: at 1440 by 860, list, map and detail are all visible at once, clicking a row or a marker selects the same record in all three, and `?open=incident:inc-1` opens with that incident selected.

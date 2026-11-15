---
id: t21-record-detail
effort: high
checkpoint: CP3
files: components/BoardTabs.tsx, components/BoardCards.tsx, components/RecordCard.tsx, components/TaskCard.tsx (stopPropagation only), components/LiveBoard.tsx, components/map/* , app/map/page.tsx, new components/detail/*
---
# Click any card: all its metadata, pinned on a map. One "Incident sites" tab

Dan's request: on the board (`/`, every tab: sites, needs, shelters, roads, incidents, tasks), clicking a card opens everything the desk knows about that record and pinpoints it on a map.

## Behaviour
- **Open:** clicking a card (or Enter/Space when it has focus) opens a detail panel. On `md` and up it is a right-side panel over the board, about 45% wide, full height under the nav. Below `md` it is a full-screen sheet. Escape and a "Close" button close it. The URL gets `?open=<kind>:<id>` (for example `?open=site:site-57`) so a link opens the same panel. Buttons and the History toggle inside a card must not open the panel (`stopPropagation`).
- **Map first:** the top ~40% of the panel is a small Leaflet map. The selected record has the selected ring (`ring-4 ring-primary`, as on `/map`), centred at zoom 16. Every other mappable record is drawn too, faded (`opacity-50`), for context. NASA zones from `/data/zones.geojson` underneath (reuse `ZoneLayer`, `HatchDefs`, `useZones`). Under the map: "Open on the full map", which links to `/map?focus=<kind>:<id>`.
- **No guessing location.** Resolve where a record is with one pure function `locate(kind, record, board)` in `components/detail/locate.ts`:
  site, shelter, road, incident use their own `coords`. A need uses the first of its `siteIds` that has coords. A task uses the location of its `recordType`/`recordId`. An incident without coords uses its task's site (say "Shown at <address>, no position of its own", as `/map` does).
  When nothing resolves, the map area shows "No location yet" instead of a map.
- **Metadata below the map**, in this order:
  1. Title (same as the card), tier word ("Danger to life", "Urgent", "Comfort"), priority, status tag, confidence word.
  2. A definition list of every field of the record in plain labels ("People trapped", "Call status", "Observed", "Region"). Dates show age plus exact time ("14 min ago, 03:15"). Ids are shown but muted. Masked phones stay masked. Write the field labels in one map per record type in `components/detail/fields.ts`. Unknown extra fields from a future API still render with their raw key, so nothing is hidden.
  3. Sources (sites): each source and its event id.
  4. Linked records, each clickable to switch the panel to it: a site's tasks, needs at the site, incidents on its tasks. A need's sites and tasks. A task's record and its blocking incident (`blockedBy`) and `replaces`. An incident's task and the site it was heading to.
  5. History (reuse `History`) and, for incidents, actions taken.

## Make `/map` take a focus
`/map?focus=<kind>:<id>` selects that item and flies to it on load (the keys in `mapItems.ts` are already `<kind>:<id>`).

## Share, do not copy
Move the marker drawing (`icon()` and the zone/hatch pieces it needs) out of `DeskMapView.tsx` into `components/map/markers.ts`, so `/map` and the panel draw the same marker for the same record. The panel map gets needs and tasks through `locate`, not new marker kinds: a need or a task is shown by ringing the site it points to.

## Data
Everything comes from the board the page already polls (`LiveBoard`), so the panel works on fixtures and on the live `/api/board` unchanged. Leaflet must load client-side only (`next/dynamic` with `ssr: false`, as `DeskMap.tsx` does).

Accept when: every tab's cards open the panel, a site, a need, a task and the incident each pin the right place, "Near the mosque, Kale" says "No location yet", `/map?focus=site:site-57` opens on that site, and Escape closes the panel.

## Also: merge the Sites and Incidents tabs into one "Incident sites" tab (Dan, 22:05)
- `BoardTabs` goes from six tabs to five: **Incident sites**, Needs, Shelters, Roads, Tasks.
- The Incident sites tab lists sites and incidents together, sorted by tier then priority (an incident's tier comes from `severityTier`). An incident whose task points at a site (directly, or through the need it delivers, the same chain `fromBoard` uses) sits directly under that site's card, indented, so a reader sees the problem next to the place. Incidents with no site sit in tier order on their own.
- The count in brackets is sites plus open incidents. The red act-now count adds both (tier 0 open sites, critical unresolved incidents).
- Clicking either kind of card opens the detail panel as above. `?open=site:<id>` and `?open=incident:<id>` both work.
- Do not change `SiteCards` or `IncidentCards` themselves, compose them in the tab.

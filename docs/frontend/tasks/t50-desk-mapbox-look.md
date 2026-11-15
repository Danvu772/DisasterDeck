---
id: t50-desk-mapbox-look
effort: high
checkpoint: judging
files: app/page.tsx, components/LiveBoard.tsx, components/BoardTabs.tsx, components/board/*, components/detail/DetailPanel.tsx (layout and styling only), app/globals.css (one elevation token only)
---
# The desk looks like a Mapbox product, with fewer features on screen

Dan: "desk needs to look good like Mapbox but keep the feature set limited." Judging: "design and usability, a stranger can use it in a minute."

## Look (Mapbox's own demos and store-locator template are the reference)
- **Map first, full bleed:** the map fills everything under the header. Mapbox basemap by default when `NEXT_PUBLIC_MAPBOX_TOKEN` is set (`components/map/basemap.tsx` already supports it, prefer the light style), Esri gray otherwise.
- **Floating panels over the map:** the list is a card floating on the left (about 360 px, rounded `--radius-card`, white, one soft elevation), the selected record's detail is a card floating on the right, both with margin from the edges so the map shows around them. On a phone: the map on top, the list as a bottom sheet.
- **One elevation token:** add `--shadow-panel` to `globals.css` (a single soft USWDS-like shadow, for example `0 2px 8px rgb(0 0 0 / 0.15)`), commented "floating map panels only". Update the line in the visual language doc that says no shadows, to "no shadows except floating map panels". Everything else stays USWDS tokens.
- **Search bar feel:** "Ask the desk" becomes a rounded search field at the top of the list card (one line, the answer appears under it inside the card).
- Typography and spacing like Mapbox's panels: bold title, muted secondary line, generous row padding, thin dividers. No new colours.

## Feature set, limited on purpose
- **Visible by default:** the filter chips (Incident sites, Needs, Shelters, Roads, Tasks), the list, the map with its markers, the selected record's card, the queue pill in the header.
- **Behind one control each, collapsed by default:** the legend (a small "Legend" button on the map), the desk feed (a "Feed" button that opens it as a card), the people strip (inside a "People" button in the list card header), NASA layers (as now, from the map's layer control).
- **Not on the desk:** the one-minute guide banner, counts summaries, anything else. They stay on their own pages.
- Every existing workflow keeps working: chips, row and marker selection, `?open=`, linked records, "Open on the full map", Ask the desk.

Accept when: tsc, eslint and check:tokens pass, `/` at 1440 by 900 shows the map edge to edge with the two floating cards, and nothing from the hidden list shows until its button is pressed. The orchestrator checks it headless and against e2e/board.spec.ts.

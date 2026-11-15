---
id: t54-mini-map-design
effort: medium
checkpoint: metrics
files: components/metrics/MapCard.tsx, components/map/basemap.tsx (one export only), app/map/page.tsx and components/map/DeskMap.tsx (only if ?focus needs a fix)
---
# The stage's map card: a reduced Mapbox, a simple slide-in, links to the exact point

Runs on top of t51 (which built `MapCard` and the location intent). The agent already calls `show_on_map` (`c221254`) and returns `{ type: "show_map", kinds, ids }`. Dan's design for the card:

- **Reduced Mapbox:** the mini map uses a simple, calm Mapbox style, not the full map's satellite: `mapbox/light-v11` when `NEXT_PUBLIC_MAPBOX_TOKEN` is set (export a `MINI_BASEMAP` from `basemap.tsx`), the Esri gray canvas otherwise. No zoom buttons, no scroll-wheel zoom, no dragging (it is a picture that can be clicked, not a second map to fight with), a single small attribution line. Fixed height about 260 px, rounded like the other cards.
- **Simple animation, once:** when the card appears, the map fades and slides up 12 px (250 ms ease-out). Then the pins drop in one after another (each scales from 0.6 to 1 with a fade, 120 ms each, staggered 80 ms), then the view settles on the fitted bounds. Nothing loops. Reduced motion: everything appears at once in its final place.
- **Links to the exact point on our map:** each pin and each row under the map links to `/map?focus=<kind>:<id>` ("Open on the map"), which opens the full map (satellite, all layers) zoomed onto that record, selected. A header link "Open all on the map" goes to `/map?focus=<first match>`. Check that `/map?focus=shelter:shelter-a` really selects and flies to it (t21 added `?focus`). Fix it there if a shelter key does not work.
- Records without coordinates stay listed as "No location yet", never guessed.

Accept when: tsc, eslint, check:tokens pass, and the report says how the pins' stagger and the focus link were checked.

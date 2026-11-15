---
id: t08-map-roads-shelters
effort: medium
checkpoint: map
files: components/map/mapItems.ts, components/map/DeskMapView.tsx, fixtures/board.ts (roads and shelters only)
---
# Roads and shelters on the map

`/map` draws sites, problems and NASA zones (see `components/map/`). Add roads and shelters through the same adapter (`fromBoard` in `mapItems.ts`), so another API still only needs an adapter.

- **Shelters:** a square marker. Its label in the list is "Shelter A, school gym, 58 of 60 beds". Full (used >= total) or above 90% gets the `urgent` tier colour, otherwise `calm`. Stale `observedAt` fades it (shelters go stale after 30 min, `STALE_AFTER_MIN`).
- **Roads:** `Road.coords` is one point. Draw a short marker at that point, not a line. Closed = solid thick ink outline, unconfirmed = dashed (that is the confidence channel). Never red: red is only act-now. Open roads are not drawn.
- Add both kinds to the legend in the same style as the existing rows.
- Fixtures: give the two shelters and two roads plausible coordinates inside the Malatya box (lat 38.33 to 38.39, lng 38.29 to 38.35).
- The list on the left keeps sites and problems first. Add a "Shelters and roads" section below them.

Accept when: `/map` shows all four kinds from fixtures and the legend explains each.

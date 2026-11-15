# Role 4 version notes

All timestamps use America/New_York, EST (UTC−05:00).

## v0.2 verification · 2026-11-14 20:07 EST

- Six Python regression checks and four Node tests pass. The added cache test confirms that a fresh checkout preserves the recorded source timestamps during an offline rebuild.
- TypeScript checking, repository lint and the existing replay/seed validator pass. The generated map matches seed IDs and keeps the selected cells' unknown damage, darkness and silence explicit.
- Updated the Role 4 and Data sources checklists in Obsidian and in the repository notes. Live UI and Brain acceptance remain open.

## v0.2 · 2026-11-14 20:04 EST

- Cached the Malatya ARIA service, catalog, export extent and PNG, two aligned Black Marble PNGs, GIBS layer/colormap metadata, POWER daily JSON and a public OSM landmark lookup. `data/nasa/manifest.json` records source URLs, SHA-256 hashes and original cache timestamps.
- Added `scripts/prepare-nasa.py` and its Python requirements. Offline rebuilds preserve the source timestamps. Refreshing the network cache is explicit.
- Generated two 500 m demo polygons in `public/data/zones.geojson`, using the seed's stable zone IDs. The four related posts count as one synthetic original call. The control counts as one separate call.
- Read −14.38 °C for 9 February 2023 from NASA POWER and set both regional cold flags. Retained unknown normalized damage and darkness because the ARIA export lacks an unflagged validity mask and the selected night-light cells saturate.
- Added `workers/satellite-watcher.ts`. The actual evidence produces two cold alerts and zero silent-zone alerts. Keys include desk, zone, observation, kind and dataset version. HTTP retries retain those keys.
- Added five Python regression checks and four Node tests, including a real local HTTP exchange with retry after a simulated lost success response and a repeated batch. TypeScript checking and repository lint passed.
- Added `docs/nasa-evidence.md` with the dated product interpretation, thresholds, independent Yeni Cami location check, usage and attribution.
- Live event ingestion, database deduplication, +20/+30 priority checks, map legend rendering and coordinator approval remain team integration acceptance. The damage/light limitations are recorded in the GeoJSON and evidence card.

## v0.1 · 2026-11-14 19:44 EST

- Published five synthetic Turkish replay messages, nine demo users, three shelters and `scripts/validate-demo-data.mjs` to main in commit `6361419`.
- Selected Ayşe as the person reported trapped and Zeynep as the callback volunteer. Prepared primary/backup suppliers and a volunteer with a van and mechanic skill.
- Validated the files and confirmed rejection of six malformed variants. SSOJet identity mapping and CP1 acceptance remain pending.

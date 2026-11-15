# Role 4 version notes

All timestamps use America/New_York, EST (UTC−05:00).

## v0.7 Malatya weather series · 2026-11-14 22:15 EST

- Added a direct NASA POWER query for minimum/maximum temperature, relative humidity, mean wind speed and daily precipitation over 6–10 February 2023. Stored the unmodified response with manifest URL, timestamp and SHA-256.
- Added day and trend-metric selectors to the map, with correct units, sources and measurement limitations. Malatya and its existing exercise identities are retained.
- Seven Python checks verify cache/output provenance, missing-value handling and rejection of changed units. TypeScript, scoped lint and desktop/phone interaction checks passed.

## v0.6 NASA map presentation · 2026-11-14 22:08 EST

- Added a collapsible map evidence card with the archived five-day POWER series, exact minimum, regional scale, source links and controls to locate both demo cells.
- Replaced repeated unknown fields with a concise hover label, a clickable evidence popup and an expandable explanation of radar validity and night-light saturation. The display suggests a coordinator review without claiming an observed priority change.
- Kept measurement nulls and alert rules intact. Six Python evidence checks, TypeScript and scoped lint passed. Chrome checks verified the five values, map focus, popup and a scrollable phone layout contained inside the map.

## v0.5 pitch and submission materials · 2026-11-14 21:36 EST

- Wrote the English Devpost story and event-app description, including NASA product credits, the grant line, AI-tool disclosure and outstanding track decisions.
- Captured the comparison and coordinator screens from local revision `2758599`, including the task-history interaction. Produced a 98.94-second English narrated and captioned MP4. Decoded the full H.264/AAC file and checked Chrome playback and seeking. The two gallery PNGs retain the app's demo labels.
- Re-ran the demo data validator and NASA dry run. The cache yields two cold alerts from one regional temperature measurement and zero silent-zone alerts. Live phone ETA and priority changes still need team rehearsal.
- Added the spoken table pitch and submission checklist. External draft/final receipts, public links, member profiles and three four-person rehearsals remain with the team.

## v0.4 site matching · 2026-11-14 21:21 EST

- A geocoded report can identify the demo site within 100 m even when the agent returns a city label or an incomplete street address. Multiple matching sites still require clarification.
- Eighteen scenario tests and four NASA tests passed, including a regression check that rejects a distant geocoded report. Repository lint, TypeScript and replay/seed validation passed on the integrated checkout.

## v0.4 integration update · 2026-11-14 21:11 EST

- Rebased onto the team's new POST event endpoint and agent implementation. All five scenario event shapes and the real NASA alerts pass the actual `lib/schemas.ts` request schema.
- New synthetic observations use the current exercise clock, matching the X/personal agents. Retry timestamps stay bound to the prepared action. The configuration keeps the historical reference scene, and NASA evidence cards show the products' acquisition dates.
- Documented the historical shelter-seed timestamps as a remaining live-rehearsal setup item. `shelter-filling` can refresh the synthetic observation for Shelter A.
- Twenty-one local tests, full TypeScript checking, repository lint and replay/seed validation pass after integration. GET board and Brain acceptance remain pending.
- Added an explicit demo gate for the current Claude/web-search implementation versus the written OpenAI/Exa track plan. Operator and track decisions are recorded for team confirmation.

## v0.4 scenario player · 2026-11-14 20:56 EST

- Added `data/scenarios/malatya.json` and `workers/scenario-player.ts` with blanket, shelter, road, breakdown and repair cues. The configuration reuses the seed and historical observation clock.
- The player reads the actual board, waits for prerequisites and binds site/need/task/incident IDs before posting. Atomic local journals and stable event keys support process restart and concurrent invocations. Prepared state is ignored by Git.
- Extracted the existing worker HTTP sender into `scripts/event-api.mjs` for reuse by the NASA watcher and scenario player. The existing NASA sender export and behavior are preserved.
- Seventeen scenario tests and four NASA tests pass, including local HTTP retry, acknowledgement loss, first-writer binding, normal CLI sending, read-only preview, delayed cues and invalid input. TypeScript, repository lint and the replay/seed validator pass. The repo's tsx entry point also runs.
- Added the player runbook and proposed two-minute table demo. Updated the Obsidian scenario checkboxes. Actual API/Brain acceptance, operator confirmation, reset agreement and live rehearsals remain pending.

## v0.3 requirements audit · 2026-11-14 20:17 EST

- Read the full NASA track guide, relevant Hacker Packet pages and the public event site. Confirmed the three selected NASA products fit the stated data scope and documented their source/sensor provenance.
- Corrected the red-and-dark example in the NASA submission checklist. The guide accepts validation against a published record or another dataset.
- Recorded direct key/account signup routes, normal Devpost entry and pending live NASA-driven behavior. The documents specify no separate organizer dataset approval for the current flow.
- Split the long local Obsidian role note into five task notes and a history note. Verified retention of all fifteen original text segments and all fifty original checkbox states. The index decreased from 22,961 to 4,085 characters.
- At 20:20 EST, verified all thirty-six links in the reorganized Obsidian notes and the relative links in the edited repository documents.

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

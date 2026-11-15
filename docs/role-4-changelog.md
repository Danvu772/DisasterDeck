# Role 4 version notes

All timestamps use America/New_York, EST (UTC−05:00).

## v1.1 Real historical tweet replay - 2026-11-15 02:31 EST

- Confirmed both pre-existing tweet files were synthetic and the planned ctoraman/avaapm research dataset contains 1,000 IDs/labels without text.
- Prepared 43 contact-redacted real archived posts mentioning Antakya, dated 7-10 Feb 2023, from Gabriel Preda's public version-24 archive (28,844 rows, archive-declared CC0), linked by a GitHub analysis project. Added source/version/hash records, per-post provenance, original IDs and reproducible standard-library preparation.
- Made the X worker default to the real archive; retained explicit synthetic rehearsal. Preserved original publication dates, validated Snowflake/string-ID precision, added desk-scoped real-post keys, dry-run mode and a real-backend preflight before paid extraction.
- Added `replay:real`, `replay:synthetic`, `check:replay` and English setup/source notes. The real command refuses silent fixture-only operation. Raw author-profile exports remain ignored. No coordinates, translations or missing source text were invented.
- Verified the pinned archive download/rebuild and seven replay integrity/worker tests. The no-cost mock pass skips all 43 mainly English records because the existing mock rules are Turkish-only; this does not claim AI extraction accuracy. No paid model calls or shared MongoDB posting were performed.

## v1.0 Antakya pilot and portable imagery · 2026-11-15 01:40 EST

- Migrated the active seed, five replay reports, scenario, fixture geography, worker/backend defaults, map centres and presenter documentation to `antakya-2023`. Existing Malatya data/history is retained; old worker environments must be updated explicitly.
- Packaged 3,060 ordinary Git WebP tiles (~50 MiB) from real Maxar WorldView-2 acquisitions on 22 Dec 2022 and 11 Feb 2023. Native source GSD is 0.50–0.67 m; map export resolution is ~0.964 m. Added hashes, source STAC records, reproducible preparation and CC BY-NC 4.0 attribution.
- Added a before/after swipe, close-up navigation, combined acquisition-footprint gaps, 743 historical HOT/OSM reference building polygons (ODbL-1.0), browser-local human review notes and JSON export. No automated damage model or field confirmation is claimed.
- Requeried NASA POWER for Antakya and extracted portable lossless Black Marble radiance/QA subsets. Two-date filtering yields 92 eligible bright-baseline pixels; 56 show ≥40% lower radiance. Displayed numerical popups and missing-observation masks; no causal outage or building/casualty inference.
- Added `npm run demo`, `npm run check:pilot`, root workstation instructions and `docs/antakya-pilot.md`. App assets need no NASA/AWS account, Python, Git LFS or additional download. Original optional HDF files and large local mosaics remain ignored.
- Verified a clean npm install and production build with no environment secrets or original NASA files. TypeScript/scoped lint, 13 Python scientific/provenance checks and 22 Node scenario/watcher tests pass. Real Edge checks passed with external requests denied: 216 local tile requests, zero failed local tiles, moving divider, building review persistence, radiance grid, observation masks, city reset and mobile layout.
- Production build retains existing Auth.js/jose Edge compression warnings. The map-only clean snapshot falls back to labeled fixture operations without MongoDB; shared Atlas/model/SSO and live Brain delivery acceptance remain separate. Existing video/screenshots describe the prior Malatya iteration and require re-recording for submission.

- Integration update at 01:46 EST: rebased onto upstream `8771193`, retained the new shared Mapbox basemap and observedAt-only clock, migrated the expanded CP2 checks to Antakya, and refreshed the completion plan for the now-implemented core Brain/dispatcher/inbox work. NASA alert/capacity/closure handling and crash recovery remain open. Repeated the merged-source Node/scoped-lint checks and Edge flow: 133 local tile requests, zero tile failures and zero page errors.

## Pipeline completion review · 2026-11-15 00:41 EST

- Reviewed main through `f235d43`, including the report-only Brain, empty dispatcher, read routes, original/v2 role screens, agent context caching and proposal refs. Updated the plan for the newly merged P-002 contract, metrics engine/charts and agent feed.
- Added an English completion plan with seven implementation steps, ownership, event/retry consistency, callback/approval/delivery/incident transitions, API contracts, replay provenance and live acceptance criteria.
- Verified TypeScript, replay/seed validation and the plan's 28 local source links. Shared Atlas, live model, SSO and end-to-end task execution were outside this documentation review's performed checks.

## v0.9 city view and simpler controls · 2026-11-14 23:52 EST

- Grouped the imagery into four main products with separate date selection. Moved cloud, acquisition gaps, original quality layers and EONET into expandable details.
- The map opens on Malatya's approximately 30 × 33 km city study extent with a satellite image. Added a city reset button and kept record-focus links working. Purple masks and synthetic cells are opt-in.
- Documented building-damage input requirements and the distinction between acquisition cadence, processing latency and the app's archived snapshots.
- TypeScript and scoped lint passed. Chrome checks covered all four groups, date options, city reset, mask/cell toggles and phone layout.

## v0.8 satellite atlas and observation limits · 2026-11-14 23:31 EST

- Added 27 dated map layer choices covering MODIS snow, IMERG precipitation rate, MODIS daytime cloud fraction, HLS Sentinel-2, Black Marble, original-file quality layers and four HLS acquisition gaps.
- User completed local Earthdata authentication. Downloaded original Black Marble and six-band HLS scenes with Fmask. Fixed the downloader's HLS collection-filter incompatibility and date interval, then completed both HLS scenes.
- Added source-specific purple masks for high cloud fraction, missing acquisitions, clipped browse pixels and original QA exclusions. Original Black Marble has valid January means in both cells; no February cell samples pass the conservative filter. No outage conclusion is generated.
- Added historical EONET catalogue points. Query returned ten worldwide events and zero points in the Malatya extent. Geometry dates are restricted to the query window.
- Verified 12 Python evidence/atlas checks, TypeScript, scoped lint and desktop/phone interactions. Prithvi model cards are accessible from the map; model inference remains unperformed.

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

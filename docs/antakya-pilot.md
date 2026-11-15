# Antakya pilot delivery

Prepared 15 November 2026, America/New_York. The pilot configuration is [data/pilot.json](../data/pilot.json). All application defaults, synthetic seed/replay coordinates, scenario and active map evidence use `antakya-2023`.

## Packaged datasets

| Dataset | Observation / provenance | Location |
|---|---|---|
| Maxar WorldView-2 visual imagery | 22 Dec 2022 before; 11 Feb 2023 after. Per-tile native GSD 0.50-0.67 m. Reprojected display tiles ~0.964 m at zoom 17. Historical acquisition, not live. | `public/data/antakya/before/`, `after/`, `imagery.json` |
| HOT/OSM destroyed-building reference | 743 historical mapped polygons intersecting the city extent. Event date 6 Feb 2023; export updated 22 May 2023. Includes retrospective annotations. | `public/data/antakya/buildings.geojson` |
| Black Marble VNP46A2 | Unclipped original radiance plus mandatory quality, cloud and snow flags, 3 Jan and 8 Feb 2023. 500 m product grid. | `data/nasa/subsets/`, `public/data/nasa-atlas/radiance-pairs.geojson` |
| NASA POWER / MERRA-2 | Five daily weather metrics, 6-10 Feb 2023, queried at 36.194 N, 36.157 E; coarse regional grid. | `data/nasa/power-weather-antakya.json`, `public/data/zones.geojson` |
| NASA GIBS / CMR / EONET | City-specific browse imagery, product-date observation limits, scene catalog and event records. | `public/data/nasa-atlas/`, `data/nasa/atlas/` |

The wider city study bbox is `[36.05,36.10,36.25,36.35]`; the high-resolution central rectangle is `[36.115,36.17,36.19,36.255]`, both west/south/east/north. Actual acquisition footprints have gaps. Enable observation limits to see the combined pre/post rendered-coverage mask. Purple does not mean a building is damaged or that every missing pixel is cloudy.

The Maxar source COGs, per-tile metadata and native GSD are linked in `imagery.json`. Tile files have SHA-256 hashes and sizes. Raw STAC and HDX responses, original zipped building export and download hashes are in `data/imagery/antakya/`. Large source COG mosaics are deliberately local caches in `.next/cache/antakya-imagery`; **the final data used by the application is committed**.

## Scientific scope

The imagery comparison and building reference support human inspection of visible structural change. Different view angles and tall-building displacement mean the images are not a validated pixel-aligned machine-learning pair. We have not trained, run or evaluated an automated collapse classifier. Building polygons are independently sourced community annotations, not ground-truth field surveys or our detections. No accuracy score is claimed.

Before advertising automated detection, select a suitable pre/post model, co-register the imagery, use event-appropriate reference labels, reserve a spatially separate evaluation area and report precision/recall and uncertainty. A shaded polygon or an image-difference threshold is not sufficient evidence of a collapse classifier.

The app records optional human notes in browser storage under `antakya-building-review-v1`, keyed by reference ID, with status and timestamp. Notes can be exported as JSON. They are local review artifacts, have no shared-database persistence, and do not create a dispatch, confirmed casualty or NASA alert.

## Reproduce and validate

For normal use, follow the root README. For offline checks, no original NASA HDF files are required:

```sh
npm run check:pilot
```

Optional data preparation needs Python 3.10+ and `scripts/requirements-nasa.txt` plus `scripts/requirements-nasa-atlas.txt`. Install these in your own virtual environment. The scripts also discover `.next/cache/nasa-python` if present.

```sh
python scripts/prepare-nasa.py
python scripts/prepare-nasa-originals.py
python scripts/prepare-nasa-atlas.py
python scripts/nasa-evidence.test.py
python scripts/nasa-atlas.test.py
```

The committed lossless NPZ subsets include radiance and QA fields, source-file hashes and geographic coordinates. Optional full raw files require your own Earthdata login through `scripts/download-nasa-originals.py`. Credentials are never part of the dataset.

To rebuild Maxar tiles, the first run reads public remote COGs and uses no credentials:

```sh
python scripts/prepare-antakya-imagery.py --download
python scripts/prepare-nasa-atlas.py
npm run check:pilot
```

Later imagery rebuilds can use `.next/cache` mosaics without `--download`. A fresh clone has all final tiles but needs `--download` to recreate source mosaics. Cache keys include extent, zoom and source metadata. Offline scripts preserve recorded download times; new remote data may differ from today's historical archive.

## Team migration

Pull main, install dependencies, validate the pilot, set `DESK_ID=antakya-2023`, and restart the app and all workers. Existing environment settings can keep an old worker on the old desk even after pulling code. The shared seed reuses synthetic user/shelter IDs, so coordinate its execution; it replaces those records with Antakya coordinates. Old Malatya events/cases are retained and are excluded by the new desk ID, not deleted.

Previous demonstration recordings are archived evidence for the Malatya iteration. Re-record the Antakya map and update the video narration before submission. Core person-event handlers, dispatcher tasks and inbox APIs have since landed upstream. Live callback/approval/delivery/incident acceptance still follows the updated `docs/completion-plan.md`; NASA alert, capacity and closure handlers remain pending.

## License

Maxar imagery: CC BY-NC 4.0. Building database: ODbL-1.0, with OpenStreetMap/HOT attribution and applicable share-alike terms. These datasets are separately licensed from application code. See [the distributed attribution file](../public/data/antakya/ATTRIBUTION.md).

## Operational alignment, 15 November 2026

The project owner confirmed Antakya as the operational base. Shared defaults read `data/pilot.json` through `lib/pilot.ts`. This covers database reads, workers, health checks, personal-agent location context and map centres. Explicit `DESK_ID` settings still select a configured desk.

The operations-room exercise uses approximate Antakya neighbourhood pins, seed shelter locations and the board road locations. Its live view uses event observation times for hourly charts and labels its configured desk. Historical USGS overlays appear during the historical exercise. Authentic source coordinates and dates remain authoritative for historical records.

- [x] Align runtime defaults, fixture users, map centres and assistant search location.
- [x] Align current handoff and team-contract geography. Mark the earlier Malatya-only planning task superseded.
- [ ] Verify every shared deployment has `DESK_ID=antakya-2023` and restart its app and workers.
- [ ] Rehearse the live shared database pipeline and capture current Antakya submission footage.

# Antakya NASA evidence

This evidence was regenerated for Antakya. Previous Malatya values must not be reused for this pilot. See [the pilot delivery](antakya-pilot.md) for the separate Maxar imagery and HOT/OSM reference building data.

## Original nighttime radiance

The committed VNP46A2 subsets cover the city extent on **3 January and 8 February 2023**. They preserve unclipped `DNB_BRDF-Corrected_NTL`, mandatory quality, cloud mask, snow flag and latitude/longitude arrays. Product scale is approximately 500 m. Lossless numeric arrays and parent-file hashes are in `data/nasa/subsets/`.

Only original retrievals with mandatory quality 0, snow flag 0, a nighttime observation, sufficiently good cloud-mask quality, confidently clear conditions, and no shadow/cirrus flags pass the conservative filter. Fill values never become zero radiance.

There are **92 eligible paired pixels** with valid observations on both dates and baseline radiance at least 10 nW/(cm^2 sr). **56 of those pixels** show at least 40% lower radiance. This describes the eligible sample only, not 56 buildings or a citywide percentage. The threshold is a demo screening choice. A single historical baseline cannot isolate power loss from every other cause of changed light.

The main **NASA - Night-light change** view displays those eligible pixels. Orange marks at least 40% lower radiance; blue marks other eligible pairs. Click a cell for the before/after values and percentage. Transparency means an unavailable or excluded pair; observation limits show these excluded areas in purple. Individual-date QA frames are also available.

NASA's [published Antakya assessment](https://science.nasa.gov/earth/earth-observatory/dark-nights-in-antakya-151029/) independently describes regional light loss between 4 and 8 February, with cloud-obscured central-city observations. Those published HD maps use downscaling and different dates; they are context, not the numerical input for our January/February comparison. Neither source identifies trapped people or individual building outages.

## Weather

NASA POWER / MERRA-2 was queried at 36.194 N, 36.157 E for 6-10 February. Daily local solar time is retained. The native weather grid is 0.5 x 0.625 degrees, approximately 50 km, and is shared regional context for both synthetic cells.

| Date | Minimum C | Maximum C | Humidity % | Precipitation mm/day | Wind m/s at 2 m |
|---|---:|---:|---:|---:|---:|
| 6 Feb | 4.99 | 9.98 | 90.34 | 24.20 | 4.17 |
| 7 Feb | 1.28 | 10.01 | 71.67 | 2.73 | 3.08 |
| 8 Feb | -1.17 | 7.72 | 65.46 | 0.04 | 2.32 |
| 9 Feb | -1.05 | 9.45 | 60.04 | 0.28 | 1.20 |
| 10 Feb | -3.11 | 9.71 | 75.97 | 0.08 | 3.27 |

The zone alert reference day remains 9 February: **-1.05 C**, producing two cold alerts. The card's coldest-day summary is **-3.11 C on 10 February**. These are different dated summaries of the same five-day series, not conflicting measurements. Precipitation alone does not distinguish rain/snow, and daily mean wind is not a gust measurement.

## Radar and automatic alerts

ARIA's approximately 30 m Sentinel-1 damage proxy is a rendered surface-change layer. Vegetation, terrain and unflagged validity affect interpretation; a normalized building-damage fraction is not available from this export. The zone `damage`, `dark` and `silentZone` fields remain null. The legacy browse brightness logic is kept as a conservative separate diagnostic; the new light-change view uses original numeric radiance and QA, not the brightness of a JPEG/PNG.

The two 500 m cells are synthetic report grouping locations, with four reposts counting as one original simulated call and a separate fifth report counting as another. They do not represent total real calls, population or satellite-detected people. The current watcher emits two cold alerts and zero silent-zone alerts. HOT destroyed-building outlines are not silently converted into a NASA damage percentage.

## Provenance and reproduction

- `data/nasa/manifest.json`: original source URLs, hashes and recorded retrieval times.
- `data/nasa/atlas/manifest.json`: Antakya browse imagery and catalog provenance.
- `public/data/nasa-atlas/originals.json`: original-derived frames, cell measurements, paired counts and QA interpretation.
- `public/data/zones.geojson`: scenario evidence, weather, timestamps and source scales.
- `public/data/antakya/ATTRIBUTION.md`: separate provider credits and licenses.

Run the offline preparation and tests listed in [the pilot runbook](antakya-pilot.md). Every workstation can inspect the packaged data without an Earthdata login. A complete operational pipeline still requires the shared backend, Brain and role sessions.

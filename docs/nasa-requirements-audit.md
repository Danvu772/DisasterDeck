# NASA track source and requirements audit

Checked on **14 November 2026 at 20:17 EST**, America/New_York. This audit compares the cached source manifest and current output with the organizer's full Beyond the Horizon guide and Hacker Packet. The public event site confirms the same event dates and track. [Event website](https://hackthenest.tech/)

## Source documents

- [Beyond the Horizon guide](../hackathon_track_docs/Hack_The_Nest_2026_Beyond_the_Horizon_Guide.pdf), pages 1–5 and 8–10. Page 1 permits NASA open data with supplementary sources. Pages 2–3 name POWER. Page 4 describes Worldview/GIBS snapshots and distinguishes rendered pictures from data used for measurements. Pages 9–10 cover quality, attribution, entry and help.
- [Hacker Packet](../hackathon_track_docs/Hack%20The%20Nest%202026%20Hacker%20Packet.pdf), pages 16 and 21–23. It identifies the NASA-supported track, submission process, registration and public/synthetic/own-data rules.

## Where the chosen data came from

| Product | Actual source used | Connection to the guide |
|---|---|---|
| ARIA Damage Proxy Map, 10 February 2023 | NASA Earthdata ImageServer. ESA Copernicus Sentinel-1 observations analyzed by the NASA JPL/Caltech ARIA team with EOS-RS. The service names the sensor, date, approximate 30 m scale and credits. | An additional NASA-distributed analysis product within the guide's open NASA data scope. The guide's examples are open-ended. |
| Black Marble gap-filled BRDF-corrected radiance rendering, 3 January and 8 February 2023 | NASA Worldview snapshot service, with the selected layer and colormap verified in NASA GIBS metadata. Underlying sensor is VIIRS on the joint NASA/NOAA Suomi NPP mission. | The Worldview/GIBS route is explicitly described on page 4. VIIRS is also mentioned. |
| POWER daily `T2M_MIN`, 6–10 February 2023 | NASA POWER API, using the MERRA-2 regional meteorology source identified in the returned JSON. | POWER is explicitly listed on page 2 and used in a temperature request on page 3. |
| Yeni Cami landmark and field report | OpenStreetMap supplies a public reference location. DHA supplies the dated independent damage report. | Supplementary data is allowed on page 1. These sources support location checking. |

The three NASA products were retrieved directly from the NASA services above. The two 500 m polygons, replay messages and report-origin mapping were created for the demo and labeled synthetic. Eleven cached files include images, metadata and the landmark reference. Their individual URLs, timestamps and hashes are in [the manifest](../data/nasa/manifest.json).

[ARIA service and credits](https://gis.earthdata.nasa.gov/portal/rest/services/DISASTERS_202302_EARTHQUAKE_TURKIYE/2302_opera_dpm/ImageServer), [GIBS layer metadata](https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml), [POWER API documentation](https://power.larc.nasa.gov/docs/services/api/)

## Compliance assessment

The source selection fits the track's stated scope. Historical 2023 data and the Türkiye location are consistent with the guide's archival examples. Page 8 identifies Michigan ideas as suggestions. The guide describes a broad choice of NASA datasets and tools.

| Requirement | Current evidence and remaining action |
|---|---|
| NASA data drives the project | Two genuine POWER-backed cold events are generated. Live Brain priority changes and user-visible consequences still need to be demonstrated. Full project compliance is pending that integration. |
| Name dataset, place, dates, pixel size and sources | Recorded in the evidence card, GeoJSON and manifest. The final app legend and Devpost page still need verification. |
| Use the data correctly and explain missing coverage | `damage`, `dark` and `silentZone` remain unknown where the PNGs cannot support the decision. The guide's page 4 supports using these renderings for display. Quantitative satellite measurements require original data with the relevant validity/quality information. POWER provides numerical temperature data directly. |
| Compare with a known record or second dataset | The Yeni Cami overlay has a documented coarse comparison with DHA's field report. Power conditions and silent-zone detection remain unresolved. |
| Attribution and required grant line | Included in `docs/nasa-evidence.md`. It must also appear on the submitted project page. Final branding must follow the guide's restriction on NASA logos and endorsement claims. |
| Submission | Select Beyond the Horizon on Devpost, include every teammate, a public repository and a video of at most three minutes. These submission steps remain unverified. |

The earlier checklist's red-and-dark district was the team's proposed demonstration example. The organizer's actual quality requirement allows comparison with a published record or another dataset. It does not require that particular combination, ARIA, Black Marble, Prithvi or a Michigan location.

## Access and organizer requests

The guide and packet specify ordinary submission and public NASA access. They describe no separate organizer approval, assigned dataset request or NASA data allocation for this flow. The cached endpoints returned data without credentials.

- **NASA API key.** Page 1 tells each teammate to obtain their own free key through [api.nasa.gov](https://api.nasa.gov/). This is a direct signup. The current ARIA, GIBS/snapshot and POWER requests run without that key.
- **Earthdata Login.** Pages 4–5 direct people downloading original Earthdata files to create a free account. If we advance to quantitative VIIRS data and quality flags, the downloader may need this separate account. [Earthdata signup](https://urs.earthdata.nasa.gov/users/new)
- **Track entry.** Opt in to Beyond the Horizon on Devpost. Add the grant credit, data links, teammates, public repository and video through the normal submission process. Repo visibility still requires the team's decision and administrator action.
- **Optional scientific help.** Page 10 directs dataset questions to the track's Discord channel. A useful question concerns which original VIIRS product and quality flags to use for the saturated Malatya display. The guide treats this as a help route.

Required credit line for the submitted project page follows.

Supported by the Michigan Space Grant Consortium, NASA grant 80NSSC20M0124.

## Audit checklist

- [x] Read all ten pages of the NASA track guide and the relevant packet pages.
- [x] Check official source domains, product identities, sensor provenance and guide references.
- [x] Distinguish the team's red-and-dark example from the organizer's broader validation requirement.
- [x] Record current evidence limitations and the live integration/submission work still pending.
- [x] Split the long Obsidian role note while preserving all original text segments and 50 checkbox states.
- [ ] Verify the live NASA-driven priority change and final project page before claiming the track's full quality bar is met.

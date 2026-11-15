# NASA satellite atlas · Malatya

## Use the map

Open `/map`, expand **NASA · Satellite & weather**, and use **Image and acquisition date**. **Locate image area** frames the approximately 30 km regional extent. **Show observation limits (purple)** toggles the selected product's limitation mask. Weather observations below the layer controls retain their own date selector.

| Layer | Acquisition dates | Interpretation |
|---|---|---|
| MODIS snow index | 6–10 Feb 2023 | Rendered NDSI snow index at about 500 m. Follow the linked NASA color scale. Transparent pixels can include snow-free ground, water, cloud and missing data. |
| IMERG precipitation rate | 6–10 Feb 2023 | GIBS rendering of the precipitation-rate product on a 0.1° native grid. The NASA scale gives rates in mm/hour. Rendering resolution does not add native detail. |
| MODIS daytime cloud fraction | 6–10 Feb 2023 | About 5 km. Purple marks rendered values ≥80% cloud fraction. This threshold is a demo choice and indicates possible optical obstruction for that product/time. |
| HLS Sentinel-2 before/after | 1 and 9 Feb 2023 | 30 m reflectance browse images. Original HLS RGB and Fmask-derived quality layers are also available. |
| Black Marble before/after | 3 Jan and 8 Feb 2023 | 500 m browse imagery plus original quality-filtered radiance. Numerical means use original radiance, with units nW/(cm² sr). |
| HLS acquisition gaps | 6–8 and 10 Feb 2023 | No HLSS30 scene intersected the queried extent on these dates. The mask covers the search extent. Other sensors may have observations. |
| EONET | Query window 6–10 Feb 2023 | No returned points in the Malatya extent. The worldwide option displays ten returned events using positions actually dated within the window. These include cyclones and icebergs. |

The purple mask describes each product's observation limitations. Unmarked areas still need the relevant scientific quality checks. An optical cloud mask does not describe radar visibility. No satellite data establishes who is inside a building.

## Original product quality

The account owner signed in locally through Earthdata. Original HDF5 and GeoTIFF files are retained under `data/nasa/originals/`, which is ignored by Git. The public derived output records source URLs, file names and SHA-256 hashes.

Black Marble processing uses `DNB_BRDF-Corrected_NTL`, with mandatory quality 0, no snow, nighttime, medium/high cloud-mask quality, confidently clear conditions, and no shadow or cirrus. Negative fill values are excluded. Gap-filled radiance is excluded from the comparison. The 500 m cell means require at least 80% valid cell-centre samples.

- Turuncu Avlu, 3 Jan: 38.61025 nW/(cm² sr), two valid samples.
- Mor Avlu, 3 Jan: 37.31932 nW/(cm² sr), one valid sample.
- Both cells, 8 Feb: zero samples pass the filter. Their after means remain absent. These two observations do not establish a power outage.

Original radiance images share an asinh display stretch from 0 to 40. The numerical means use the original unclipped values. The 8 Feb browse-image saturation and the original product's quality exclusions are different limitations.

HLS uses Fmask cloud, shadow, cloud/shadow adjacency, missing-data and high-aerosol flags. Snow is retained in the displayed surface image. The before scene is heavily clouded. On 9 Feb the queried local area also has extensive excluded pixels, including high-aerosol flags. Scene-level cloud percentages describe the entire satellite tile and cannot substitute for these local masks.

## Reproduce

Install `scripts/requirements-nasa-atlas.txt` in your Python environment. The helper also discovers a local install under `.next/cache/nasa-python`.

```sh
python scripts/prepare-nasa-atlas.py --download
python scripts/download-nasa-originals.py
python scripts/prepare-nasa-originals.py
python scripts/prepare-nasa-atlas.py
python scripts/nasa-atlas.test.py
```

The interactive downloader prompts for Earthdata credentials and uses `persist=False`. The atlas builder works offline with the committed image and metadata caches. Regenerating original-derived images additionally needs the locally downloaded originals. `--hls-only` resumes an interrupted HLS download.

- `data/nasa/atlas/manifest.json` records each public-source URL, retrieval timestamp and file hash.
- `public/data/nasa-atlas/atlas.json` contains layer dates, geographic bounds, EONET points and source links.
- `public/data/nasa-atlas/originals.json` contains original-derived frame metadata, measurement results and source-file hashes.

## Prithvi scope

The map links to NASA/IBM's Prithvi model cards and flood/burn-scar examples. Six HLS Sentinel-2 bands were downloaded for each selected scene, alongside Fmask. Model inference has not been run. A flood or burn classification on this snowy earthquake scene needs its own validation before it can support an operational claim.

## Sources

[NASA GIBS access](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) · [MODIS snow product](https://nsidc.org/data/mod10a1/versions/61) · [NASA IMERG](https://gpm.nasa.gov/data/imerg) · [NASA HLS quality and products](https://hls.gsfc.nasa.gov/data-products/) · [Black Marble file specification](https://ladsweb.modaps.eosdis.nasa.gov/filespec/VIIRS/2/VNP46A2_v2.0.fs) · [EONET API](https://eonet.gsfc.nasa.gov/docs/v3)

Supported by the Michigan Space Grant Consortium, NASA grant 80NSSC20M0124.

# Antakya data credits and reuse

## Imagery

Imagery © Maxar Open Data Program, WorldView-2. Source dates: 22 December 2022 and 11 February 2023.

License: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).
Terms: https://creativecommons.org/licenses/by-nc/4.0/
Source / access: https://registry.opendata.aws/maxar-open-data/

Changes: selected source COGs were mosaicked, reprojected to Web Mercator, resampled to an approximately 0.96 m ground display grid at zoom 17, compressed to WebP, and reduced to zooms 11–16. The native source GSD is recorded per source tile in imagery.json; a denser source/output grid is not improved optical resolution. Exact per-scene exported ground pixel size is in imagery.json. High-resolution coverage is a central study rectangle, not all of Hatay province.

No endorsement by the imagery provider is implied. Commercial reuse requires terms compatible with the source license.

## Destroyed-building reference polygons

© OpenStreetMap contributors. Humanitarian OpenStreetMap Team (HOT), distributed through the Humanitarian Data Exchange (HDX).

License: Open Database License 1.0 (ODbL-1.0).
Terms: https://opendatacommons.org/licenses/odbl/1-0/
Source: https://data.humdata.org/dataset/hotosm_tur_destroyed_buildings

Changes: selected polygon features intersecting the Antakya pilot extent; retained reference/source attributes, omitted address/name attributes, added origin/assessment/modelPrediction=false fields. The derived building database in buildings.geojson remains under ODbL-1.0, with its attribution and applicable share-alike obligations.

This is historical community mapping of destroyed buildings associated with the 6 February 2023 event. Its exported annotations may have been added after the replay date. It is not a model run by this project, a contemporaneous operational feed, an exhaustive damage inventory or field validation. Unmarked buildings are not assessed as safe.

## NASA evidence

NASA Black Marble VNP46A2 radiance and quality fields, NASA GIBS browse imagery and NASA POWER weather are credited separately in the atlas and source manifests. Maxar imagery and HOT building labels must not be described as NASA products.

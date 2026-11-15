# Antakya satellite atlas

The map starts with the **Buildings - high-resolution comparison** view. The controls are in the initially expanded **Antakya - Satellite evidence** panel. Source imagery, dates and resolutions are visible alongside provider links.

## Main views

| View | Use |
|---|---|
| Buildings - high-resolution comparison | Local Maxar tiles, 22 Dec 2022 / 11 Feb 2023. Move the divider or disable comparison to select one date. Click Inspect buildings up close, then select HOT/OSM reference polygons at zoom 15+. |
| Satellite image | NASA HLS city browse imagery, 30 m. The 1 Feb scene has no rendered coverage here; the 9 Feb view is available. |
| Snow | MODIS daily snow-index browse. Transparent pixels alone cannot distinguish snow-free ground, cloud, water or missing data. |
| Precipitation | IMERG precipitation-rate browse, native 0.1-degree grid. It does not resolve street conditions. |
| NASA - Night-light change | Original paired radiance and quality flags, 3 Jan / 8 Feb, approximately 500 m. 92 eligible pairs, 56 with at least 40% lower radiance. Click a cell for actual values. |
| Street map | Explore the wider city without a scientific raster overlay. |

The central high-resolution rectangle has source-image footprint gaps. Outside it, the street map provides context. **Show whole city area** resets the wider Antakya study extent. Pan and zoom to focus on any neighbourhood; the synthetic cells are optional overlays.

## Observation limits

Purple is off by default. Enable it under **Quality & additional sources**. The mask belongs to the selected product and dates:

- High-resolution pair: at least one acquisition has no rendered coverage. This is a footprint/nodata mask, not a cloud classifier.
- Paired Black Marble: unavailable, poor-quality or low-baseline paired observations. Individual-date masks apply the documented radiance QA filter.
- HLS browse: no rendered observation. Original HLS QA is not provided for Antakya by the old Malatya granules.
- MODIS daytime cloud fraction: documented colors representing at least 80% cloud fraction. This is a coarse daytime observation, not a nighttime Black Marble cloud mask.
- Acquisition gaps: no matching HLSS30 scene for the queried date and extent. Other sensors may have observations.

Unmarked areas are not declared safe. A valid optical observation still cannot see through roofs or assess every internal structural failure. No blind spot is inferred from an absence of calls.

## Buildings and human review

The 743 HOT/OSM polygons are external historical mapped destroyed buildings, not a model run by Disaster Deck. Click for the mapping source. Optional review notes are local to the browser; export JSON to share them. They do not update MongoDB or send dispatches.

## Availability and cadence

This is a packaged historical snapshot. Maxar Open Data releases follow disaster activations, without a guaranteed recurring acquisition schedule. NASA product acquisition, cloud-free usability and publication latency are separate from how frequently the web app refreshes its files. No live satellite feed is claimed.

EONET is optional contextual data. No points were returned inside the Antakya study extent for 6-10 February. Worldwide results should not be presented as local disaster evidence.

See [pilot reproduction and licenses](antakya-pilot.md), [NASA measurements](nasa-evidence.md), and [the root workstation instructions](../README.md).

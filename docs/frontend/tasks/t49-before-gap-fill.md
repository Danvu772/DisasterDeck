---
id: t49-before-gap-fill
effort: medium
checkpoint: map
files: components/map/NasaAtlas.tsx
---
# Fill the "before" gap with NASA's own pre-quake imagery, and say so

Dan's screenshot: in "Buildings, high-resolution comparison" with "Compare before / after", huge chunks of the before side are blank.

## Why (measured 15 Nov, 02:15)
- `public/data/antakya/imagery.json`: the Maxar **before** mosaic (22 Dec 2022) covers **73.8%** of the study box, the **after** mosaic (11 Feb 2023) covers 100%. Every tile file exists, the gaps are transparent pixels.
- In the Maxar Open Data catalog for this event (76 acquisitions, checked), **22 Dec 2022 is the only pre-quake pass that overlaps Antakya at all**. No other high-resolution before image exists to fill the gap.
- `public/data/nasa-atlas/atlas.json` has `hls-before-2023-02-01` (NASA HLS, 30 m, 1 Feb 2023, five days before the quake), and its bounds contain the whole study box.

## Build (in `NasaAtlas.tsx`, the `HighResolution` part and the panel text)
- On the **before** side of the high-resolution view (both in compare mode and when before is shown alone), render the HLS before image (`hls-before-2023-02-01`, `ImageOverlay` with its bounds) **underneath** the Maxar before tiles, clipped to the same swipe side as the Maxar before layer, so the gap areas show the 30 m pre-quake image instead of blank.
- Never fill the before side with the after image or the basemap: that would put post-quake or undated pixels under a "before" label.
- Panel text under the date line: "Before: Maxar 22 Dec 2022 (0.5 m) covers 74% of this area. The rest is NASA HLS 1 Feb 2023 (30 m), the only pre-quake image there." Read the coverage number from `imagery.json` (`before.coverageFraction`), not hard-coded. Keep both source links (Maxar license, NASA source).
- Optional if quick: a thin dashed outline of where the 0.5 m image ends, from `before-limits.png` (purple marks no coverage), shown only on the before side.
- No change to the after side, the building outlines, or the other atlas frames.

Accept when: tsc, eslint and check:tokens pass. The orchestrator checks it headless at the same view as Dan's screenshot.

---
id: t09-map-validation
effort: low
checkpoint: map
status: backlog (after t08, same files)
files: components/map/DeskMapView.tsx
---
# Show the independent NASA check on the map

`data/nasa/validation.json` and `docs/nasa-evidence.md` ("Independent check") describe the Yeni Cami collapse, a documented landmark used to check the ARIA overlay. Show it on `/map` as a small ink ring marker with a tooltip: "Independent check: Yeni Cami collapsed, 6 Feb 2023 (DHA). ARIA overlay covers 98% of its 500 m cell." Read the numbers from the JSON at build time or fetch it from `public/` (ask in your report if it is not served). Add one legend line.

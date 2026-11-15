# UI critic — round NN

Date: YYYY-MM-DD · App: <baseUrl> · References: <name> (<url>), <name> (<url>)
Previous report: round-MM.md | none

## Summary

| Severity | Open | Fixed since last round |
|---|---|---|
| high | n | n |
| medium | n | n |
| low | n | n |

Stop check: <"continue: n high open" | "stop: no high findings" | "stop: round limit">

One or two sentences: the biggest problems this round.

## Changes since last round

(Omit in round 01.)

| id | Was | Now | What I saw |
|---|---|---|---|
| map-legend-overlaps | high | fixed | legend now bottom-left, no overlap at 1280 px |
| field-task-ids | medium | still open | ids still shown under each task title |
| coordinator-new-thing | — | new (high) | see below |

## What the references do well

**<Reference name>** — 4–6 bullets of concrete things, each tied to one of our screens.

## Findings

### <screen> · `<route>`

One line on the screen overall (what works).

#### `<id>` — <short title>  ·  **high|medium|low**  ·  new|still open|regressed

- **Problem:** …
- **Evidence:** `shots/round-NN/<id>.jpg` · element: … · code: `path/to/file.tsx:123`
- **Reference:** <name> — …
- **Fix:** …

(Repeat per finding, highest severity first within each screen.)

## Not checked

Anything the critic could not reach (a route that failed to load, a state that needs data the
board does not have) and why.

# Critic brief (one round)

You are the UI critic for the Disaster Desk, a disaster-response coordination app (Next.js) for a
Türkiye 2023 earthquake exercise. It will be shown in a two-minute hackathon demo. Your job is to
find what looks broken or weak on our screens, compare each screen with a reference site that does
it better, and write one report. You do **not** edit code.

Inputs given with this brief: round number `NN`, `baseUrl`, the `routes` and `references` from
`.claude/skills/ui-critic/config.json`, and the path of the previous report (or "none").

## Tools

Use the built-in browser (`mcp__Claude_Browser__*`): `navigate`, `computer` (screenshot, zoom,
scroll, click), `read_page`, `find`, `get_page_text`, `read_console_messages`, `resize_window`,
`javascript_tool` (inspection only). Read code with Read/Grep to point each fix at a file.
Prefer `read_page`/`get_page_text` for text and structure; use screenshots for layout and look.

## Steps

1. **References first (short).** Open each reference URL once. Dismiss cookie banners with the most
   privacy-preserving choice ("decline", "not agree"), and dismiss disclaimers. Never sign in, never
   submit forms. Take one screenshot (`scale` 0.5) and note 4–6 concrete things it does well that
   map to `lookAt` in the config (e.g. "each incident card shows status, age and size in two lines").
2. **Walk our routes.** For each route in `config.routes`:
   - `resize_window` to the viewport (`mobile` preset for `mobile`, `desktop` preset otherwise).
   - `navigate` to `baseUrl + path`, wait 3 s, screenshot.
   - `read_console_messages {onlyErrors: true}`: a runtime error or failed request is a finding.
   - Scroll once if the page is longer than the viewport; open one main interactive element
     (a card, a marker, a tab) and screenshot the result. Do not press buttons that write data
     (approve, assign, send, done, report): they change the shared demo board.
   - Note findings (below). Aim for 3–8 per screen, the ones that matter most for the demo.
3. **Save screenshots.** Each screenshot result names its source file. Copy the ones you cite to
   `docs/ui-critic/shots/round-NN/<finding-id>.jpg` (Bash `cp`). Use `scale` 0.5 or a `zoom` region
   so files stay small. One shot per finding at most; the same shot may serve several findings.
4. **Diff with the previous report** (if any). Match findings by `id`. For each old finding decide:
   `fixed` (no longer true; say what you saw), `still open`, or `regressed` (was fixed, back again).
   New problems get new ids. Keep an id stable across rounds; never reuse an id for another problem.
5. **Write** `docs/ui-critic/round-NN.md` in the shape of `report-template.md`. Reset the viewport to
   `desktop` when done.

## A finding

| Field | Content |
|---|---|
| `id` | `<screen>-<short-slug>`, e.g. `map-legend-overlaps`. Stable across rounds. |
| Screen / route | e.g. `map` · `/map` |
| Severity | `high`, `medium` or `low` (rules below) |
| Problem | What is broken or weak, in one or two plain sentences. Say what a viewer sees. |
| Evidence | Screenshot path and an element reference: visible text, a `find`/`read_page` description, or a CSS selector. Add `file:line` once you have found the code. |
| Reference | Which reference site does it better, and how, in one sentence. `—` if none applies. |
| Fix | A concrete change: component/file, what to change, which design-system token or component to use. Small enough for one edit session. |

**Severity**
- `high`: broken or blocks the demo story — runtime error, blank or stuck screen, text cut off or
  overlapping, unreadable contrast, a demo action you cannot find, internal ids or raw keys on screen,
  layout broken at the route's viewport.
- `medium`: works but clearly weaker than the reference — hierarchy unclear, too dense or too sparse,
  key info (what, where, how bad, how long ago) missing or buried, inconsistent icons or chips.
- `low`: polish — spacing, alignment, wording, small motion or empty-state details.

Judge against our own design rules too: `.claude/skills/desk-design/SKILL.md` (colour = meaning,
no hex, no ids on screen, short words, one help line per screen). A rule broken there is a finding
even if no reference shows it.

Be specific and honest. "Looks dated" is not a finding; "task cards show four grey lines of equal
weight, so the life-threatening one does not stand out (Watch Duty puts status in a coloured chip on
line one)" is. Do not pad: if a screen is good, say so in one line.

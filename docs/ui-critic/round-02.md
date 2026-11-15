# UI critic — round 02

Date: 2026-11-15 · App: http://localhost:3123 · References: Watch Duty (https://app.watchduty.org), HOT Tasking Manager (https://tasks.hotosm.org/explore)
Previous report: round-01.md

**Setup note.** This round ran on a different server from round 01 (:3123, started with `DESK_BACKEND=fixture`; round 01 ran on :3000).
The board is partly fixture data. `/talk` shows the fixture task "Rescue at Çınar St. 3". The desk list and feed show other records ("Turuncu Avlu", "simulated news update, pass 3").
Round-01 findings about live data are marked "not checked" where fixture data cannot show them.

**Root cause of the dead pages (found this round).** Two `next dev` servers ran from the same folder and shared one `.next` build directory: pid 51862 on `-p 3123` and pid 52526 on `-p 3124`, both started 07:34.
They overwrote each other's client chunks. At 07:35 `.next/static/chunks/app/coordinator/` and `.../field/` were empty folders.
Every page whose chunk is missing loads its server HTML and never hydrates: `/_next/static/chunks/app/<route>/page.js → 404`, `ChunkLoadError` in the console.
The :3124 server has since exited, but :3123 still answers 404 for the coordinator, field, map and agent chunks. Only `/` and `/talk` hydrate.
This is not a code bug; see the fix under `coordinator-page-not-hydrated`.

## Summary

| Severity | Open | Fixed since last round |
|---|---|---|
| high | 7 | 2 |
| medium | 2 | 5 |
| low | 7 | 3 |

Stop check: continue: 7 high open

Four of the six screens never become interactive (coordinator, field, map, volunteer), because two dev servers share `.next`. Restarting a single server should clear four of the seven highs at once.
The other three highs are the desk map framing (code blocked, file busy) and the feed still showing "simulated news update, pass N" and "[mock, not translated]" text.

## Changes since last round

| id | Was | Now | What I saw |
|---|---|---|---|
| nav-links-hidden | high | fixed | at 1024 px with the "Zeynep" chip, the links wrap to a second row; Field and Talk fully visible (right edges 446 / 498 px) |
| desk-map-framed-too-wide | high | still open | desk map still opens on a "100 km" scale bar with two dots; `DeskGlMap.tsx` was not changed (blocked) |
| desk-feed-plumbing | high | still open | partly fixed: actor words now read "News", "Shelter sheet", "Social post". The rows still say "Adıyaman Gölbaşı–Malatya Sürgü road closed: simulated news update, pass 3" (stamped "just now") and "[mock, not translated] Aynı çağrıyı…" |
| desk-events-api-500 | high | not checked | fixture backend. One burst of 500s on `/api/board`, `/api/events` and `/api/health` at the same moment, then 200 again. That matches the shared-`.next` rebuild, not the events route |
| desk-list-all-red-stale | medium | fixed | child task rows have no tier chip unless overdue; done rows show only "Done"; no "Stale" chip on the page |
| desk-task-title-repeats-place | medium | still open | "Call about Turuncu Avlu, Turuncu Avlu", "Rescue at Mor Avlu, Mor Avlu" on the desk; "Rescue at Turuncu Avlu, Turuncu Avlu" on the field phone |
| desk-hydration-mismatch | medium | fixed | no "Hydration failed" message on `/` |
| desk-waiting-minutes | low | fixed | "Zeynep · waiting 4 h" |
| desk-avatar-badges-overlap | low | fixed | avatars spaced; count dots no longer cover initials |
| desk-inbox-401 | low | fixed | one 401 per load, then polling stops |
| coordinator-page-not-hydrated | high | still open | `app/coordinator/page.js → 404`, `ChunkLoadError`; "Approve" button has no React props; pill stays "Connecting"; "Demo data" badge. Cause: shared `.next` (see header) |
| coordinator-internal-id | high | fixed | problem card reads "Asked the backup depot to take it over (6 km away)" |
| coordinator-demo-names | low | still open | "On duty: Demo Nöbetçi Koordinatör", "Send Saha Ekibi A to Kale" |
| map-first-view-empty | high | still open | `/map` never draws the map (see `map-page-not-hydrated`). `DeskGlMap.tsx` framing code is unchanged (blocked), and the same component on `/` still opens at 100 km |
| map-markers-over-popup | high | not checked | `/map` map canvas never rendered; code unchanged (blocked) |
| map-list-missing-status | medium | fixed | rows now read "1 trapped · Stopped by a problem", "2 trapped · Needs a coordinator", "Asking a team" |
| map-filter-chips-cut | low | still open | last chip cut to "Roa…" at the panel edge |
| map-marker-numbers | low | not checked | map never rendered |
| field-page-not-hydrated | high | still open | `app/field/page.js → 404`; "Details" does not open (aria-expanded stays false after two clicks); main buttons have no React props |
| field-no-where | medium | still open | card shows place, "1 person", title; no address, distance or directions |
| field-header-clipped | low | still open | fix does not work: at 375 px all route links still render ("Coordinat…" cut), see the finding |
| volunteer-buttons-before-accept | medium | fixed | next-task card shows only Accept and Decline |
| volunteer-title-truncated | medium | fixed | "Call about site 11, Yeni Mahalle Sokak 12" wraps to two lines |
| talk-internal-id | high | not checked | fixture tasks contain no "Proposed team: … (id)" text. `plainDetail()` (`components/detail/fields.ts:67`) looks right in code |
| talk-tasks-dup | low | still open | "Rescue at Çınar St. 3" listed under "Your tasks" and again under "All tasks" |
| map-page-not-hydrated | — | new (high) | see below |
| volunteer-page-not-hydrated | — | new (high) | see below |
| field-zero-min-left | — | new (low) | see below |
| map-list-address-unknown | — | new (low) | see below |
| volunteer-viewas-cut | — | new (low) | see below |

Totals: 10 fixed, 11 still open, 0 regressed, 4 not checked, 5 new.

## What the references do well

Rechecked briefly; round-01 notes still hold.

**Watch Duty** (`shots/round-02/ref-watchduty.jpg`)
- Incident cards: name + icon, address, "Acres · Containment", then a bold status + age line ("Active · Updated 40 minutes ago"). This is the model for our map list (now close) and field card (still no address).
- Inactive incidents are grey and active ones coloured, so state carries the colour.
- Map tool stack on the right (Layers, Legend, Tools, Radar), each icon with a word under it.
- Side list with search and a "Last Updated" sort at the top.

**HOT Tasking Manager** (`shots/round-02/ref-hotosm.jpg`)
- Each card has a priority chip top-right (URGENT), then id, title, a short blurb, bold contributor count and a progress bar.
- A filter bar of dropdowns above the grid, and a result count ("showing 34 of 863 projects").
- Long titles wrap to two or three lines; place names stay readable.

## Findings

### all routes · dev setup

#### Shared cause of the four `*-page-not-hydrated` findings

- Two `next dev` processes in `/Users/omerbicakcioglu/multip/HackTheNest26` used the same `.next` folder (:3123 and :3124). Each rebuild deleted the other's client chunks.
- **Fix (for whoever owns the server, not a code edit):** run one dev server per folder. If a second one is needed, give it its own build dir, e.g. `NEXT_DIST_DIR=.next-3124` read by `distDir` in `next.config.ts`.
  Then stop :3123, delete `.next`, start it again, and load each route once. Check that `curl -o /dev/null -w '%{http_code}' localhost:3123/_next/static/chunks/app/coordinator/page.js` returns 200 for coordinator, field, map and agent.

### desk · `/`

Clean list and detail; most round-01 list fixes landed. The done tasks are calm now, and "waiting 4 h" reads well.

#### `desk-map-framed-too-wide` — map opens on half of Türkiye  ·  **high**  ·  still open

- **Problem:** The map opens at "100 km" with two dots; Antakya is a speck.
- **Evidence:** `shots/round-02/desk-map-framed-too-wide.jpg` · scale bar "100 km" · code: `components/map/gl/DeskGlMap.tsx:334-342` (not changed; the fixer was blocked)
- **Reference:** Watch Duty — opens on the incident area.
- **Fix:** As in round 01: fit the first view to sites, needs and shelters only, or clamp to `ANTAKYA` when the box is wider than ~0.3°. Do it once the other session releases `DeskGlMap.tsx`.

#### `desk-feed-plumbing` — feed still shows "simulated news update, pass N" and "[mock, not translated]"  ·  **high**  ·  still open

- **Problem:** Partly fixed: the source words are now "News", "Shelter sheet" and "Social post". Rows stamped "just now" still read "Adıyaman Gölbaşı–Malatya Sürgü road closed: simulated news update, pass 3". Social posts still show "[mock, not translated] Aynı çağrıyı yeniden paylaşıyorum…".
  The code in `workers/synthetic-feed.ts:75` now writes "Closed after a news report", and `x-extract.ts` no longer has the prefix. So these new events come from a feed process that started before the fix: its pass counter restarted at 0 about 10 minutes earlier. Old events in the store also keep the old text.
- **Evidence:** `shots/round-02/desk-feed-plumbing.jpg` · section "Desk feed" · code: `components/EventRow.tsx` renders `reason` as stored
- **Reference:** Watch Duty — each update is a plain sentence with a time.
- **Fix:** Restart the synthetic feed worker so it runs the new code. In `EventRow.tsx`, also hide old text on screen: drop a `: simulated news update, pass \d+` suffix and a leading `[mock, not translated] ` before rendering. Then old rows look right too.

#### `desk-task-title-repeats-place` — "Call about Turuncu Avlu, Turuncu Avlu"  ·  **medium**  ·  still open

- **Problem:** Existing tasks keep the doubled place. It shows on the desk list, in the detail "Related" list and on the field phone.
- **Evidence:** `shots/round-02/desk-feed-plumbing.jpg` (list and Related) · `shots/round-02/field-page-not-hydrated.jpg` · code: `workers/dispatcher.ts` `titleFor` (fixed for new tasks only)
- **Reference:** —
- **Fix:** Add a display helper in `components/detail/fields.ts`: `taskTitle(t)` collapses `X, X` to `X`. Use it in `BoardList`, `RecordCard`, `FieldPhone` and `PinnedList`.

### coordinator · `/coordinator?user=coordinator-duty`

Card layout is still good (tier chip top-right, "Waiting 18 min · too long" in red, one primary Approve). "History" opens because it is a native element, but nothing scripted works.

#### `coordinator-page-not-hydrated` — page never becomes interactive  ·  **high**  ·  still open

- **Problem:** `/_next/static/chunks/app/coordinator/page.js` returns 404, and the console shows `ChunkLoadError: Loading chunk app/coordinator/page failed`. The Approve button has no React handlers, the pill stays on "Connecting", and the page shows a "Demo data" badge. The first load of the route even showed Next's "404 This page could not be found" during a rebuild.
- **Evidence:** `shots/round-02/coordinator-page-not-hydrated.jpg` · network `app/coordinator/page.js → 404` (three times) · `.next/static/chunks/app/coordinator/` empty at 07:35
- **Reference:** —
- **Fix:** See "Shared cause" above: one dev server per `.next`, a clean restart, and a check that the chunk returns 200.

#### `coordinator-demo-names` — Turkish role names in an English UI  ·  **low**  ·  still open

- **Problem:** "On duty: Demo Nöbetçi Koordinatör", "Send Saha Ekibi A to Kale". The same names appear in the nav chip, the talk popover ("Approved by Demo Nöbetçi Koordinatör") and the volunteer "View as" strip.
- **Evidence:** `shots/round-02/coordinator-page-not-hydrated.jpg` · code: `fixtures/desk.ts`, seed users
- **Reference:** —
- **Fix:** Needs the author's decision (skipped by the fixer). Proposal: "Duty coordinator", "Field team A", "Depot A".

### map · `/map`

The list is much better: every row now says what the desk is doing ("Stopped by a problem", "Needs a coordinator"). But the map itself does not draw.

#### `map-page-not-hydrated` — map area is an empty grey box  ·  **high**  ·  new

- **Problem:** `app/map/page.js` returns 404 on two loads. No MapLibre canvas is created, the right two-thirds of the screen stay empty grey, and the pill stays on "Connecting". In round 01 this route hydrated.
- **Evidence:** `shots/round-02/map-page-not-hydrated.jpg` · `canvas.maplibregl-canvas` absent after 6 s · network `app/map/page.js → 404`
- **Reference:** —
- **Fix:** See "Shared cause" above.

#### `map-first-view-empty` — first view framed too wide  ·  **high**  ·  still open

- **Problem:** Could not be seen on `/map` this round (no map). The framing code is unchanged and the same component on `/` still opens at 100 km, so the problem stands.
- **Evidence:** `shots/round-02/desk-map-framed-too-wide.jpg` · code: `components/map/gl/DeskGlMap.tsx:334-342`
- **Reference:** Watch Duty — first view is the incident area.
- **Fix:** Same as `desk-map-framed-too-wide`.

#### `map-filter-chips-cut` — last filter chip cut  ·  **low**  ·  still open

- **Problem:** The chip row ends in "Roa…" at the panel edge.
- **Evidence:** `shots/round-02/map-page-not-hydrated.jpg` · code: `components/map/MapScreen.tsx` (blocked last round)
- **Reference:** HOT — the filter bar wraps.
- **Fix:** `flex-wrap` on the chip row.

#### `map-list-address-unknown` — two rows titled only "Address unknown"  ·  **low**  ·  new

- **Problem:** Two list rows have the title "Address unknown", so they look like the same place. (Left over from `map-list-missing-status`, whose main point is fixed.)
- **Evidence:** `shots/round-02/map-page-not-hydrated.jpg` · rows 2 and 5 · code: `components/map/MapScreen.tsx`
- **Reference:** Watch Duty — the name line is always distinct.
- **Fix:** Use "Site 2 · address unknown", as the desk list already does.

### field · `/field?user=field-alpha` (mobile)

The card is still strong: tier chip, big step buttons, one red Problem button. It does not respond.

#### `field-page-not-hydrated` — field phone never becomes interactive  ·  **high**  ·  still open

- **Problem:** `app/field/page.js → 404`. "Details" does not open (aria-expanded stays `false` after two clicks), and the step buttons have no handlers. The green "Live" chip is server HTML, so it claims a live state the page does not have.
- **Evidence:** `shots/round-02/field-page-not-hydrated.jpg` · network `app/field/page.js → 404` · `.next/static/chunks/app/field/` empty
- **Reference:** —
- **Fix:** See "Shared cause" above.

#### `field-no-where` — card does not say where or how far  ·  **medium**  ·  still open

- **Problem:** No address, distance or directions on the task card.
- **Evidence:** `shots/round-02/field-page-not-hydrated.jpg` · code: `components/field/FieldPhone.tsx:266-275`
- **Reference:** Watch Duty — the second line of every card is the address.
- **Fix:** The fixer skipped this because the payload lacks distance. The address is already reachable: `aboutRecord.address` (`FieldPhone.tsx:158`). Show it under the place name now, plus a "Directions" outline button (Lucide `Navigation`) that opens a maps link for the record. Add distance later.

#### `field-header-clipped` — route links still shown on the phone  ·  **low**  ·  still open

- **Problem:** At 375 px the nav still shows Desk, Agent, Map, Ops room and "Coordinat…" cut off. The fix does not apply: in `cn(path.startsWith("/field") && "hidden sm:flex", "no-scrollbar order-last flex …")` tailwind-merge keeps the later `flex` and drops `hidden`.
- **Evidence:** `shots/round-02/field-page-not-hydrated.jpg` · all seven links have `display: block` inside a visible strip · code: `components/Nav.tsx:53`
- **Reference:** Watch Duty — mobile header is logo + menu only.
- **Fix:** Put the conditional last, `cn("no-scrollbar order-last flex …", path.startsWith("/field") && "hidden sm:flex")`, or use `max-sm:hidden`.

#### `field-zero-min-left` — "0 min left" on both tasks  ·  **low**  ·  new

- **Problem:** The top card and the "Your other tasks" row both read "0 min left" in mono, which looks like a stuck timer. Because the page does not hydrate, the number never moves.
- **Evidence:** `shots/round-02/field-page-not-hydrated.jpg` · code: `components/field/FieldPhone.tsx:106-108` (`timeLeft`)
- **Reference:** Watch Duty — age in words.
- **Fix:** In `timeLeft`, return "Due now" when `-1 < min < 1`, and "N min late" with the destructive colour after that.

### volunteer · `/agent?user=volunteer-callback`

Round-01 fixes landed: Accept + Decline only, and the title wraps to two lines. The page itself does not run.

#### `volunteer-page-not-hydrated` — Accept, Decline and the agent chat are dead  ·  **high**  ·  new

- **Problem:** `app/agent/page.js → 404`. Accept, Decline, the three suggested questions and the "Ask your agent" input do nothing, and the chat shows a "Demo data" badge. In round 01 this route hydrated.
- **Evidence:** `shots/round-02/volunteer-page-not-hydrated.jpg` · network `app/agent/page.js → 404`
- **Reference:** —
- **Fix:** See "Shared cause" above.

#### `volunteer-viewas-cut` — "View as" strip cuts the last name  ·  **low**  ·  new

- **Problem:** The "View as" chips end in "Demo Nöbetçi Koordinat…" at the card edge.
- **Evidence:** `shots/round-02/volunteer-page-not-hydrated.jpg` · code: `app/agent/page.tsx:38`
- **Reference:** —
- **Fix:** Show first names or short role words in the chips ("Zeynep", "Field team A", "Depot A", "Coordinator"). That also follows from `coordinator-demo-names`.

### talk · `/talk`

Hydrates and works; calm and clear. No id shows in the Tasks popover on fixture data.

#### `talk-tasks-dup` — top task listed twice  ·  **low**  ·  still open

- **Problem:** "Rescue at Çınar St. 3" appears under "Your tasks" and again under "All tasks". The detail line is cut ("3 people, voices heard (Zeynep, 40 mi…").
- **Evidence:** `shots/round-02/talk-tasks-dup.jpg` · dialog "Your tasks" · code: `components/talk/TalkScreen.tsx:326-327`
- **Reference:** —
- **Fix:** Hide "All tasks" when it holds only the tasks already listed above. If unpinning needs the row, show "No other tasks" instead of the duplicate.

## Not checked

- `desk-events-api-500` (live events route): server runs on fixture data. A single simultaneous 500 burst on three APIs was seen, which points to the rebuild.
- `talk-internal-id`: the fixture tasks have no "Proposed team: Name (id)" text; recheck on the live board.
- `map-markers-over-popup`, `map-marker-numbers`: `/map` did not draw a map.
- Coordinator, field and volunteer interactions (Modify sheet, Details panel, Problem sheet, chat): pages did not hydrate. Write buttons are out of scope anyway.
- Data consistency between screens: `/talk` shows the fixture task "Rescue at Çınar St. 3", while the desk list shows other records. Probably the `DESK_BACKEND=fixture` setup mixed with live events; not judged.
- Light theme: not checked this round.

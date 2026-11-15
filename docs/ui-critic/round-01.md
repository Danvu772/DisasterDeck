# UI critic — round 01

Date: 2026-11-15 · App: http://localhost:3000 · References: Watch Duty (https://app.watchduty.org), HOT Tasking Manager (https://tasks.hotosm.org/explore)
Previous report: none

## Summary

| Severity | Open | Fixed since last round |
|---|---|---|
| high | 10 | 0 |
| medium | 7 | 0 |
| low | 8 | 0 |

Stop check: continue: 10 high open

Two pages never become interactive (`/coordinator` and `/field`: their page script returns 404, so buttons are dead and the status pill stays on "Connecting"), and both maps open framed on half of Türkiye, so the first view is an almost empty dark box. Internal ids and feed plumbing (`supplier-backup`, `(field-alpha)`, `simulated news update, pass 73`, `[mock, not translated]`) are on screen in the demo path.

Viewport note: the pane's "desktop" size is about 1000 CSS px wide (screenshots are scaled to 800 px). Screens were checked in the app's dark theme; the desk was also checked in light.

## What the references do well

**Watch Duty** (`shots/round-01/ref-watchduty.jpg`)
- Each incident card has three lines: name with a severity icon, address, then "Acres · Containment" and **status + age in one bold line** ("Active · Updated 25 minutes ago"). Maps to our desk list and map list.
- Inactive incidents use a grey icon; active ones a coloured icon. Colour carries state, so the eye goes to live fires first. Our list is red on every row.
- The map opens on the area that has incidents, with a calm basemap and strong markers. Our maps open on a 30–100 km view with two dots.
- Map tools are a short vertical stack of labelled icon buttons (Layers, Legend, Tools, Radar). Every icon has a word under it.
- The list sits in a fixed side panel with a search box and a sort control ("Last Updated") at the top.

**HOT Tasking Manager** (`shots/round-01/ref-hotosm.jpg`)
- Each project card has a **priority tag top-right** (URGENT / HIGH) in an outlined chip, then title, a short blurb, a **bold contributor count**, a progress bar, and the difficulty word at the bottom. Maps to our volunteer and coordinator cards.
- A filter bar of dropdowns sits above the grid (Mapping mode, Difficulty, Any project, Status, More filters), with the result count ("showing 34 of 863 projects").
- The person claims work on the project page, one task at a time. The list card has no action buttons, so the list stays calm.
- Long titles wrap to two or three lines instead of being truncated, so the place name is always readable.

## Findings

### nav · all routes

The header is clean and the active route is clearly marked.

#### `nav-links-hidden` — Field and Talk links disappear when a person chip shows  ·  **high**  ·  new

- **Problem:** On `/coordinator` and `/agent` the "acting as" chip (for example "Demo Nöbetçi Koordinatör", "Zeynep") and the inbox count take the right side of the header. The link strip then scrolls with a hidden scrollbar, so "Field" is cut to "Fie"/"I" and "Talk" is not visible at all. A presenter cannot find the next demo screen.
- **Evidence:** `shots/round-01/nav-links-hidden.jpg` (also `coordinator-page-not-hydrated.jpg`, "Fie" next to the chip) · element: `nav[aria-label=Main]` link strip; measured link right edges Field 587 px / Talk 639 px under the chip · code: `components/Nav.tsx:53` (`overflow-x-auto … no-scrollbar … lg:flex-1`) and `components/Nav.tsx:63-66`.
- **Reference:** Watch Duty — the top bar holds only the logo and a menu; navigation never competes with account controls.
- **Fix:** In `Nav.tsx`, let the link strip wrap to its own row below `xl` (`order-last w-full` up to `xl` instead of `lg`), or shorten the chip in `ActingAs` to the avatar plus first name (`max-w-32 truncate`). Check at 1024 px with `?user=coordinator-duty`.

### desk · `/`

The two-pane layout (list left, detail right) is clear, and the detail card's "People trapped / Reported by" tiles read well.

#### `desk-map-framed-too-wide` — map opens on half of Türkiye  ·  **high**  ·  new

- **Problem:** The desk map opens at about 100 km scale (Adana and Aleppo visible), with two cluster dots. Antakya, where all sites are, is a speck. For the first 3 s the map is a blank dark box. A viewer does not see a city in an earthquake.
- **Evidence:** `shots/round-01/desk-map-framed-too-wide.jpg` · element: map scale bar "100 km" · code: `components/map/gl/DeskGlMap.tsx:334-342` (`firstView` fits the bounds of all `placed` items, including the Adıyaman–Malatya road and the Narlı–Malatya railway, which are ~150 km away).
- **Reference:** Watch Duty — opens on the area with active incidents, markers large and readable.
- **Fix:** In `DeskGlMap.tsx`, compute `box` from sites, needs and shelters only (leave roads and incidents out), or clamp to `ANTAKYA` (line 49) when the box is wider than ~0.3°. Same fix covers `map-first-view-empty`.

#### `desk-feed-plumbing` — feed shows internal ids, test labels and Turkish text  ·  **high**  ·  new

- **Problem:** The Desk feed shows source plumbing: "Synthetic news", "Synthetic sheet", "simulated news update, pass 81", "[mock, not translated] Aynı çağrıyı yeniden paylaşıyorum…", and an id "(#mwhrpucg-8)" at the end of a drill line. Most rows say "Merged with an earlier report". The same road flips "closed"/"open" every pass. Our rules forbid ids and plumbing on screen, and require English.
- **Evidence:** `shots/round-01/desk-feed-plumbing.jpg` · element: section "Desk feed" rows · code: `workers/synthetic-feed.ts:75` (`reason: simulated news update, pass ${cycle}`), `agents/research/x-extract.ts:254` (`[mock, not translated]`), rendered by `components/EventRow.tsx:25-26` and `components/board/BoardList.tsx:66` (road line).
- **Reference:** Watch Duty — each update is a plain sentence with a time; no pipeline names.
- **Fix:** In `synthetic-feed.ts` write a human reason ("Closed after the landslide report") and keep the pass number out of `reason`. In `x-extract.ts` mock mode, return an English placeholder (or the fixture `en` text from `components/compare/adapt.ts`) instead of prefixing the Turkish text. Strip a trailing `(#…)` token in `EventRow`. Map actor "Synthetic news/sheet/feed" to "News", "Shelter sheet", "Social post" in `actorLabel` (`components/detail/fields.ts`).

#### `desk-events-api-500` — feed falls back to "Demo data"  ·  **high**  ·  new

- **Problem:** `GET /api/events?limit=30` returned 500 during the walk (it was 200 a minute earlier). The desk feed then shows a "Demo data" badge, and the `/agent` feed shows fixture rows ("Building collapsed in Kale", "Shelter A, school gym") that do not match the live board.
- **Evidence:** `shots/round-01/desk-feed-plumbing.jpg` ("Desk feed · Demo data") · network: `/api/events?limit=30 → 500` on `/agent` · code: `components/board/DeskFeed.tsx:43,57`, route `app/api/events/`.
- **Reference:** —
- **Fix:** Check the dev-server log for the `/api/events` stack trace and fix the route (another session may be mid-edit). In `DeskFeed`, keep the last good live data on a single failed poll instead of switching to fixtures.

#### `desk-list-all-red-stale` — every row is red and "Stale", so nothing stands out  ·  **medium**  ·  new

- **Problem:** Almost every list row has a red "Life-threatening" chip and a "Stale" chip; task rows add a status chip. Four equal chips per row, so the one site waiting for a team does not stand out from done call tasks. Done tasks ("Call about … · Done") still sit in the list in red.
- **Evidence:** `shots/round-01/desk-list-all-red-stale.jpg` · element: `ul[aria-label="Shared priority list"]` · code: `components/board/BoardList.tsx:113-117` (`TierBadge` on every tier<2 row), `components/Stamp.tsx:21` ("Stale").
- **Reference:** Watch Duty — status and age share one bold line; finished incidents turn grey.
- **Fix:** In `BoardList.ListRow`, hide the tier badge on done tasks and fade the row (`opacity-60`); show the tier badge only on the site row, not on each child task. Replace the "Stale" chip with muted age text (fade only) in `Stamp.tsx`.

#### `desk-task-title-repeats-place` — "Call about Turuncu Avlu, Turuncu Avlu"  ·  **medium**  ·  new

- **Problem:** Task titles repeat the place when a site has no case number: "Call about Turuncu Avlu, Turuncu Avlu", "Rescue at Mor Avlu, Mor Avlu". The same title shows on `/talk` ("Top task") and `/field`.
- **Evidence:** `shots/round-01/desk-list-all-red-stale.jpg` · code: `workers/dispatcher.ts:1051-1054` (`n` falls back to `where(rec)`, then `${rec.address}` is appended again).
- **Reference:** —
- **Fix:** In `titleFor`, append `, ${rec.address}` only when `rec.caseNo` is set (`Call about site 5, Kayısı Caddesi 10`); otherwise `Call about Turuncu Avlu`. Existing tasks keep the old title, so also dedupe in the UI (`components/detail/fields.ts` title helper) for the demo board.

#### `desk-hydration-mismatch` — server and client disagree on "waiting N min"  ·  **medium**  ·  new

- **Problem:** React reports "Hydration failed" on `/`: the server rendered "waiting 35 min", the client "waiting 36 min". React throws away the server HTML and re-renders; the Next dev overlay counts 10 issues.
- **Evidence:** console error "Hydration failed because the server rendered text didn't match the client" in `BoardList > ListRow` · code: `components/board/BoardList.tsx:73` (`minutesSince(…, now)`).
- **Reference:** —
- **Fix:** Pass the server's `now` to the client as the first value (the page already has `now`; make sure `BoardList` uses the same prop on first render), or add `suppressHydrationWarning` on the time span only.

#### `desk-waiting-minutes` — "waiting 244 min"  ·  **low**  ·  new

- **Problem:** Task lines say "Zeynep · waiting 244 min"; the age next to it says "4 h ago". Two units for the same idea.
- **Evidence:** `shots/round-01/desk-list-all-red-stale.jpg` · code: `components/board/BoardList.tsx:73`.
- **Reference:** Watch Duty — one age, in words ("about 2 hours ago").
- **Fix:** Use `ageText()` from `components/encode.ts:63` for the waiting time ("waiting 4 h").

#### `desk-avatar-badges-overlap` — task count dots cover the next avatar  ·  **low**  ·  new

- **Problem:** In "On the desk", the count dot of one avatar sits on the initials of the next one ("Z" and "SE" are half hidden).
- **Evidence:** `shots/round-01/desk-feed-plumbing.jpg` (bottom of list card) · code: `components/board/PeopleStrip.tsx:17` (`-space-x-1.5`) and the badge at `-right-0.5 -top-0.5`.
- **Reference:** —
- **Fix:** Use `gap-1` instead of `-space-x-1.5`, or move the count below the avatar.

#### `desk-inbox-401` — inbox polls fail every 5 s when nobody is signed in  ·  **low**  ·  new

- **Problem:** `GET /api/inbox` returns 401 every 5 s on `/` and `/map`; the console fills with red errors during the demo.
- **Evidence:** console "Failed to load resource: 401" · code: `components/InboxBadge.tsx:18,27`.
- **Reference:** —
- **Fix:** In `InboxBadge`, skip the fetch when there is no `?user=` and no session, or stop polling after the first 401.

### coordinator · `/coordinator?user=coordinator-duty`

The card layout is good: decision cards with the tier chip top-right, the place, "Waiting 18 min · too long" in red, and one primary "Approve" button (same idea as HOT's priority tag).

#### `coordinator-page-not-hydrated` — page never becomes interactive  ·  **high**  ·  new

- **Problem:** The page script `/_next/static/chunks/app/coordinator/page.js` returns 404 (twice, after a reload). The page shows only the server-rendered fixture: Approve/Modify/Reject do nothing, the header pill stays on "Connecting", the page says "Demo data", and the live board (6 escalated rescue tasks) never appears.
- **Evidence:** `shots/round-01/coordinator-page-not-hydrated.jpg` · network: `app/coordinator/page.js → 404`; "Connecting" still shown after 13 s · code: `app/coordinator/page.tsx`, `components/coordinator/CoordinatorDesk.tsx`.
- **Reference:** —
- **Fix:** Look at the dev-server output for a compile error in the coordinator import tree (other sessions are editing `components/`). If none, restart `next dev` and clear `.next`. Not a styling fix; verify the chunk returns 200 before round 02.

#### `coordinator-internal-id` — "Relay task to supplier-backup"  ·  **high**  ·  new

- **Problem:** The "Vehicle broke down" problem card lists "Relay task to supplier-backup (6 km away)": a user id on screen.
- **Evidence:** `shots/round-01/coordinator-internal-id.jpg` · element: "Problems in the field" card, third arrow line · code: `fixtures/board.ts:100`.
- **Reference:** —
- **Fix:** Change the fixture text to the person's name ("Asked Demo Depo B to take it over (6 km away)"). Also check that live problem actions use names, not `_id`s.

#### `coordinator-demo-names` — Turkish role names in an English UI  ·  **low**  ·  new

- **Problem:** "On duty: Demo Nöbetçi Koordinatör", "Send Saha Ekibi A to Kale": Turkish role words mixed into English sentences. Also a source shown as a bare "X · 1 h ago".
- **Evidence:** `shots/round-01/coordinator-page-not-hydrated.jpg` · code: `fixtures/desk.ts` (user names).
- **Reference:** —
- **Fix:** Rename demo users to English ("Duty coordinator", "Field team A") in `fixtures/desk.ts` and the seed, or keep Turkish personal names only (Zeynep). Write "X (Twitter)" or "Social post" for the source.

### map · `/map`

The left list with count tiles (15 places, 13 life-threatening, 0 hazards) is clear, and clicking a row flies the map to the place with a good human-words popup ("1 person trapped · Waiting for a team · 4 reports · Confirmed · 6 h ago").

#### `map-first-view-empty` — map opens as a black box with dots at the edges  ·  **high**  ·  new

- **Problem:** `/map` opens at 30 km scale on an all-black basemap; three markers sit at the top-right and bottom-left corners. It reads as a broken map until the viewer clicks a list row.
- **Evidence:** `shots/round-01/map-first-view-empty.jpg` · element: scale bar "30 km" · code: `components/map/gl/DeskGlMap.tsx:334-342`.
- **Reference:** Watch Duty — first view is the incident area.
- **Fix:** Same as `desk-map-framed-too-wide`: fit bounds over sites/needs/shelters only, or open on `ANTAKYA`.

#### `map-markers-over-popup` — markers draw on top of the open card  ·  **high**  ·  new

- **Problem:** With a place open, other markers ("2", "1") are painted over the popup card, covering its text ("1 person trapped").
- **Evidence:** `shots/round-01/map-markers-over-popup.jpg` · code: `components/map/gl/DeskGlMap.tsx:443-444` (markers get `zIndex` 10–30) and `:457` (`Popup` has no z-index).
- **Reference:** Watch Duty — the selected incident's card sits above all markers.
- **Fix:** Give the popup a higher layer: `style={{ zIndex: 50 }}` on `<Popup>` or `.maplibregl-popup { z-index: 50 }` next to `app/globals.css:296`.

#### `map-list-missing-status` — list rows show size and age but not status  ·  **medium**  ·  new

- **Problem:** Each row is a red avatar, the address and "1 trapped" with an age. It does not say what is happening (called, team on the way, done) and has no tier chip; all 13 avatars look the same. Two rows read "Address unknown".
- **Evidence:** `shots/round-01/map-first-view-empty.jpg` · element: left list · code: `components/map/MapScreen.tsx` (list rows).
- **Reference:** Watch Duty — every card has a bold "Active · Updated 25 minutes ago" line.
- **Fix:** Add the loop step as the second line ("1 trapped · Team on the way"), reusing `LOOP_LABELS` as in `BoardList.lineOf`. Use "Site 2 · address unknown" instead of a bare "Address unknown".

#### `map-filter-chips-cut` — last filter chip cut to "Roa"  ·  **low**  ·  new

- **Problem:** The filter chips row is cut at the panel edge ("Roa…") with no sign that it scrolls.
- **Evidence:** `shots/round-01/map-first-view-empty.jpg`.
- **Reference:** HOT — the filter bar wraps.
- **Fix:** `flex-wrap` on the chip row, or shorter labels ("Urgent" for "Life-threatening").

#### `map-marker-numbers` — numbers inside markers are not explained  ·  **low**  ·  new

- **Problem:** Markers show "1", "2", "3" (people trapped). Without a legend a viewer reads them as counts of reports or cluster sizes.
- **Evidence:** `shots/round-01/map-markers-over-popup.jpg`.
- **Reference:** Watch Duty — has a "Legend" button in the map tool stack.
- **Fix:** Add a one-line legend chip on the map ("Number = people trapped"), or a `title` on the marker.

### field · `/field?user=field-alpha` (mobile)

The task card is strong: tier chip, time left in mono, big "On our way / Arrived / Done" buttons and one red "Problem" button.

#### `field-page-not-hydrated` — field phone never becomes interactive  ·  **high**  ·  new

- **Problem:** `/_next/static/chunks/app/field/page.js` returns 404 (twice). The phone shows the server render only: the buttons do nothing, "Checking voice…" never changes, and the status pill is a grey dot. On the first load the server render said "No task right now" while `/api/board` had two open tasks for `field-alpha`; without hydration the page cannot catch up.
- **Evidence:** `shots/round-01/field-page-not-hydrated.jpg` · network: `app/field/page.js → 404` · code: `app/field/page.tsx`, `components/field/FieldPhone.tsx:136,222`.
- **Reference:** —
- **Fix:** Same as `coordinator-page-not-hydrated`: find the compile error in the field import tree or restart `next dev`. Verify the chunk is 200.

#### `field-no-where` — the task card does not say where or how far  ·  **medium**  ·  new

- **Problem:** The card shows "Turuncu Avlu", "1 person" and the title, but no address line, distance or way to open directions. A field team needs "where" first.
- **Evidence:** `shots/round-01/field-page-not-hydrated.jpg` · code: `components/field/FieldPhone.tsx` (card header).
- **Reference:** Watch Duty — the second line of every card is the address.
- **Fix:** Add a meta line under the title: address + "420 m away" (the dispatcher already computes distance) and a small "Directions" outline button (Lucide `Navigation`).

#### `field-header-clipped` — phone header wastes space and cuts the nav  ·  **low**  ·  new

- **Problem:** On a 375 px phone the nav shows "Coordinat…" cut off, and the status pill is a bare grey dot with no meaning.
- **Evidence:** `shots/round-01/field-page-not-hydrated.jpg` · code: `components/Nav.tsx:53`, `components/StatusPill.tsx:63-70`.
- **Reference:** Watch Duty — mobile header is logo + menu only.
- **Fix:** Hide the route links on `/field` below `sm` (the field team needs only this screen), or show them in a menu.

### volunteer · `/agent?user=volunteer-callback`

Good structure: profile, next task, your needs, and the agent chat side by side, with three suggested questions above the input.

#### `volunteer-buttons-before-accept` — four actions shown before the task is accepted  ·  **medium**  ·  new

- **Problem:** The next-task card shows Accept, Decline, Done and a red Problem button at once, plus an "Assigned" chip. "Done" before "Accept" is confusing, and the red button pulls the eye more than Accept.
- **Evidence:** `shots/round-01/nav-links-hidden.jpg` · element: "Next task" card · code: `components/TaskCard.tsx:55-66`.
- **Reference:** HOT — the person claims one task with one clear action; other actions appear after.
- **Fix:** In `TaskCard`, show Accept + Decline until the task is accepted; then show Done + Problem. Keep the "one primary action" rule from the comment at line 26.

#### `volunteer-title-truncated` — task title cut before the address  ·  **medium**  ·  new

- **Problem:** "Call about site 11, Yeni M…": the address, the key "where", is truncated in a wide card.
- **Evidence:** `shots/round-01/nav-links-hidden.jpg` · code: `components/RecordCard.tsx:71` (`truncate`).
- **Reference:** HOT — titles wrap to two lines.
- **Fix:** Replace `truncate` with `line-clamp-2` in `RecordCard.tsx:71`.

### talk · `/talk`

Clean and calm: one question, three example chips, a big hold-to-talk orb. No reference; judged on our rules only.

#### `talk-internal-id` — "(field-alpha)" in the task list  ·  **high**  ·  new

- **Problem:** The Tasks popover detail reads "Proposed team: Saha Ekibi A (field-alpha), 420 m away": a user id on screen.
- **Evidence:** `shots/round-01/talk-tasks-popover.jpg` · element: dialog "Your tasks" · code: `workers/dispatcher.ts:115`, `:470`, `:794`.
- **Reference:** —
- **Fix:** Drop `(${pick.user._id})` from the three `Proposed team:` strings. If the agent needs the id, keep it in a separate field, not in `detail`.

#### `talk-tasks-dup` — top task listed twice in the Tasks popover  ·  **low**  ·  new

- **Problem:** The popover shows the same task under "Your tasks" and again under "All tasks"; titles are truncated, so the address is cut.
- **Evidence:** `shots/round-01/talk-tasks-popover.jpg` · code: `components/talk/TalkScreen.tsx:326-327`.
- **Reference:** —
- **Fix:** Exclude the pinned top task from `items` in "All tasks", and use `line-clamp-2` for titles.

## Not checked

- Coordinator and field buttons and expanded views (Approve/Modify, Details, Problem sheet): the pages did not hydrate, and write buttons are out of scope anyway.
- Hold-to-talk and the voice agent: need a microphone.
- Light theme on every screen: only the desk was checked in light (same map framing problem; basemap blank at 100 km).
- `/api/events` 500 and the 404 chunks may be transient while other sessions edit `components/`; round 02 should re-check first.

---
tags: [hackathon, frontend, design]
status: v4, USWDS values in Ömer's v2 layout (15 Nov)
---
# Frontend visual language

Read with: [[Role 3 - Frontend]] · [[Team contracts]] · [[Final system design]]

## v4 (15 Nov, Dan)

Dan compared v1 with Ömer's `redesign/v2` and kept v1's workflows with v2's layout. Every value still comes from USWDS. The reasoning is in [`docs/frontend/DECISIONS.md`](../../frontend/DECISIONS.md). What changed from v3:

- **Faces.** Public Sans for all text, headings included. Roboto Mono (`font-mono`) is back, but only for ids, times, scores, counts in pills and machine output, the way USWDS itself uses it. Never for labels, headings or prose. `check:tokens` still bans `font-serif`.
- **Grey page.** `paper` is now `base-lightest` (`#f0f0f0`), so white cards sit on a light grey page like v2.
- **Dark header.** `night` (`base-darkest`) bar on every page: logo, "Disaster Deck", the "Antakya exercise, synthetic data" pill, role tabs (current tab is a white pill with ink text), who is acting, and the queue status pill. Links on the bar are white and underlined, because `primary` blue does not pass contrast on `night`.
- **One green.** `ok` (`success-dark`) and `ok-soft` (`success-lighter`) exist for the healthy queue pill and nothing else. "Brain running, queue 0" is green. "Brain not running, queue 1, oldest 96 min" and "The desk is not answering" are act red, because somebody has to go fix it.
- **Pills and chips.** New `pill` radius (USWDS `pill`, `99rem`). `encode.ts` adds `chip(active)` for filter chips, `pill` for neutral labels, and `tierText(tier)` for v2's "T0 Danger to life" badge text (code in mono, word in sans).
- **No shadows.** USWDS cards are flat with a border. The shadow scale is unset in `globals.css`.
- **`check:tokens` scans CSS too.** Every `*.css` under `app/` and `components/` except `app/globals.css`. v2's `theme.css` hid 42 hex values (lmao), so that hole is closed.

Anything below that contradicts this section is v3 and loses.

## Background

Every screen in this app answers the same five questions about a thing on the desk: **how bad is it, how sure are we, how old is it, who is on it, and where is it.** The data model already answers all five (`tier`, `confidence`, `observedAt`, `assignee`/`history`, `coords`). The visual language is just a fixed mapping from those fields to what the eye sees, so a judge who has watched the board for 30 seconds can read any card on any screen.

The rule that makes it work is **one field, one visual channel, never shared.** If red means "tier 0" on the board but "closed road" on the map and "error" in the chat, nobody can read red anymore. Bertin figured this out in 1967 (duh), most dashboards still ignore it.

The second rule: **the machine and the people look different.** This is a multiplayer AI product. The judges have to see at a glance which line came from a person, which from an agent, and which from a plain-code rule.

The third rule: **it should look like a default government website.** Coordinators, AFAD and Kızılay staff already read gov software every day, and anything that looks like an AI demo loses their trust. So every value comes from the [U.S. Web Design System](https://designsystem.digital.gov) (USWDS 3.14): its colour tokens, the typefaces its components use, its button, tag, alert, card and focus patterns. We do not install USWDS. Its Sass fights Tailwind and we would rewrite every component. We copy the tokens into the Tailwind `@theme` and rebuild the four patterns we need with utilities.

The fourth rule: **no decoration pretending to be structure.** No `·` separators, no `→` arrows, no `●○○` progress dots, no `…`, no uppercase letter-spaced mono labels. Those are what make a UI read as AI-generated. Separate fields with words, commas and layout ("IG, 4 min ago", "Priority 54", "Result: …"). Headings are normal sentence-case headings.

---

## Where the values come from

| Ours | USWDS token | Value | Used for |
|---|---|---|---|
| `paper` | base-lightest | `#f0f0f0` | page background, grey behind the white cards (v4) |
| `card` | white | `#ffffff` | cards, panels |
| `ink` | ink | `#1b1b1b` | all text |
| `muted` | base-dark | `#565c65` | secondary text, tags. The lightest gray that still passes AA for small text |
| `line` | base-lighter | `#dfe1e2` | dividers, card borders that carry no meaning |
| `act` | secondary-dark | `#b50909` | act-now. A true deep red that survives a washed-out projector |
| `act-soft` | secondary-lighter | `#f3e1e4` | background behind an act-now banner |
| `urgent` | warning | `#ffbe2e` | tier 1 bar |
| `calm` | base-light | `#a9aeb1` | tier 2 bar |
| `primary` | primary | `#005ea2` | anything you can click |
| `primary-dark` | primary-dark | `#1a4480` | hover |
| `focus` | blue-40v | `#2491ff` | keyboard focus ring |
| `night` | base-darkest | `#1b1b1b` | header bar only (v4) |
| `night-ink` | white | `#ffffff` | text on the header (v4) |
| `night-muted` | base-light | `#a9aeb1` | muted text and pill borders on the header (v4) |
| `ok` | success-dark | `#4d8055` | the healthy queue pill only (v4) |
| `ok-soft` | success-lighter | `#ecf3ec` | the dot inside the healthy queue pill only (v4) |
| `hatch` | base-dark | `#565c65` | NASA zones, as a hatch pattern only |

(v3, replaced by v4 above.) Type was **Source Sans** (Source Sans 3 on Google Fonts) for everything, headings and card titles included. No serif, no mono. v3 put Merriweather on headings because the USWDS `usa-prose` component pairs it that way, and it made the clickable person cards look like a 2014 blog (lmao). Real .gov pages use sans headings. `--font-serif` and `--font-mono` are set to `initial` in `globals.css` so the utilities don't exist, and `check:tokens` fails on `font-serif` or `font-mono`. USWDS only uses Roboto Mono for code samples, and Public Sans is just the USWDS docs site's own branding. Radii: card `0.5rem`, button `0.25rem`, tag `2px`, pill `99rem` (v4), all USWDS defaults.

We skipped USWDS `emergency` (`#9c3d10`). It is the semantically right token, but it is burnt orange-brown, and on a projector it sits too close to the gold tier-1 bar. `error` (`#d54309`) reads as "form error", not "person in danger".

---

## The encoding table

This table is the visual language. Everything else is layout. It lives in code as `components/encode.ts` so no component picks its own colour.

| Data | Visual channel | Values | Notes |
|---|---|---|---|
| **Act-now** (tier 0, overdue task, critical incident, health > 30 s) | Hue: `act`, the only red in the app | red / nothing | Red means "a person should act now". Nothing else is ever red. Not errors, not decoration |
| `tier` | Left bar on the card, 0.5rem wide (the USWDS alert border) | 0 `act`, 1 `urgent`, 2 `calm` | Tier always wins, so it gets the strongest channel |
| `confidence` | Line style of the card border | `unconfirmed` dashed, `corroborated` thin solid, `confirmed` thick solid | Plus the word in the footer. Never colour, colour is taken |
| `observedAt` age | Text stamp + ink opacity | "4 min ago" full ink, stale drops to 50% and gets "(stale)" | Thresholds in `STALE_AFTER_MIN`: incident 15, road and shelter 30, site and need 60 min |
| `source` | A word | X, IG, FB, sheet, NASA, person, desk | Always next to the number it backs: "58/60, IG, 4 min ago" |
| actor kind (person / agent / rule / satellite) | A bold name label | "**Agent:**", "**x-agent**", "**Zeynep**" before what they said | Changed in v3. It used to be sans vs mono, but gov sites have no mono. Every chat line, feed entry and history line starts with who said it, in bold |
| `status` | Position (column, order) + a USWDS tag | lifecycle words from `types.ts`, underscores shown as spaces | Tags are gray (`muted` fill, white uppercase text). Status never gets a colour of its own |
| **Interactive** (button, link, current tab, focus) | Hue: `primary` blue | blue / nothing | New in v2. Blue means "you can click this". Nothing that isn't clickable is blue |
| `priority` score | Small tabular number | "Priority 84" | Tier is already the bar, so the card only shows the score. Click it to see the breakdown: 10×sources + minutes + 30 silent zone + 20 cold |
| `proposed` need | Gray tier bar, dashed border + a sentence | "1 of 3 requests. Goes on the shared list at 3." | No glyph dots |
| NASA silent / cold zone | Gray hatch pattern on the map, never a fill colour | hatch + legend line "Sentinel-1, 10 Feb 2023, NASA JPL ARIA" | Moved from blue to gray in v2, because blue now means clickable |
| phone number | Masked text | `•••• •• 42` | Unmasked only inside the caller's own task |

Four hues carry meaning: act red, urgent gold, interactive blue, and the gray hatch on the map. v4 adds one green, for the healthy queue pill only. Everything else is ink on paper. If a fifth colour shows up, something is wrong.

---

## Patterns (USWDS, rebuilt in Tailwind)

| Pattern | USWDS source | Ours | Rule |
|---|---|---|---|
| Button | `usa-button` / `--outline` / `--secondary` | `button.primary`, `button.outline`, `button.act` in `encode.ts` | One primary action per card. The rest are outline. `act` is only for Problem |
| Tag | `usa-tag` | `statusTag` + `statusText()` | Gray, uppercase, 2px radius. Every status chip uses it |
| Alert | `usa-alert` (0.5rem left border) | the tier bar on `RecordCard` | The bar is the alert border. An act-now banner is `act-soft` fill + `act` bar |
| Card | `usa-card` (white, 0.5rem radius) | `RecordCard` | Card border style is taken by confidence, so we keep that instead of the USWDS gray border |
| Link | `usa-link` | `link` | Primary, underlined |
| Focus | 0.25rem solid `#2491ff` | global `:focus-visible` in `globals.css` | Never `outline-none` |
| Current nav / tab | primary bottom border | `Nav`, `BoardTabs` | v4 header: current tab is a white pill with ink text (`aria-current="page"`), the rest are white, underline on hover. `BoardTabs` keeps the primary underline until t26 |
| Chip / pill | v2 composition, `pill` radius | `chip(active)`, `pill` in `encode.ts` | Active chip has the primary border. Counts inside go in mono |
| Queue status | none (v2 health pill) | `StatusPill` in the header, `HealthLine` on screens | Same words and colours in both. Green only when the Brain is running and nothing is stuck |

---

## Primitives

Every screen is built from these and nothing else. If a screen needs something new, it becomes a primitive first.

| Primitive | What it draws |
|---|---|
| `TierBar` | the left bar, from `tier` and act-now (inside `RecordCard`) |
| `Stamp` | "source, age", fades when stale |
| `RecordCard` | site / need / road / shelter / incident. Composes TierBar, border from confidence, Stamp, status tag, score |
| `TaskCard` | a RecordCard plus Accept / Decline / Done / Problem. Accept is primary until accepted, then Done |
| `History` | `history[]` as a timeline, bold actor name per line |
| `ChatLine` | "**Agent:**" or "**Name:**" then the message |
| `StatusPill` | the header pill, polls `/api/health` every 5 s. "Brain running, queue 0" in `ok`, anything wrong in `act` |
| `HealthLine` | the same pill, fed from the board's `health`. Without `lastLoopAt` (fixtures) it reads "Queue 3, oldest 2 s" |
| `MapLayer` | pins use the same TierBar colour, zones use the gray hatch |

---

## How to prototype fast and keep control

1. **Tokens live in one file.** `app/globals.css`, Tailwind v4 `@theme` block, every value commented with its USWDS token name. Changing a value here changes the whole app. Nobody writes a hex anywhere else.
2. **The encoding table is code.** `components/encode.ts` exports `tierBar`, `confidenceBorder`, `isStale`, `ageText`, `statusTag`, `statusText`, `button`, `link`, and since v4 `chip`, `pill`, `tierText`. Components call these. They never write `bg-red-600` or a button style themselves.
3. **Fixtures with the nasty states.** `fixtures/board.ts`, typed against `lib/types.ts`. It holds the ugly cases: a stale shelter, a proposed need at 1 of 3, an overdue task, a critical incident, a site with 4 sources, a Turkish tweet with its `textEn`.
4. **A `/lab` page.** Every primitive in every state on one screen, from the fixtures. This is the design review surface. Change a token, refresh, look at everything at once.
5. **New screen ideas go in `app/lab/<name>/page.tsx`.** Compose primitives over fixtures. Promote to the real route once it reads right.
6. **A guard script.** `npm run check:tokens` greps `app/` and `components/` for raw hex, raw Tailwind palette colours and `font-serif` in `.ts`, `.tsx` and `.css` files (except `app/globals.css`), and fails if it finds any. `font-mono` is allowed since v4.
7. **Claude Design follows this file.** `.design-sync/` syncs `components/` to the Disaster Deck design-system project. After changing tokens or `encode.ts`, re-run the sync (see `.design-sync/NOTES.md`) so the design agent builds with the new rules.

## Open decisions (DECIDE)

- Density on the board: how many cards fit before "no scrolling for the main thing" breaks.
- Whether the act-now banner (`act-soft` fill) is worth adding above the board, or whether the red tab counts are enough.

Settled: the red and the amber (USWDS secondary-dark and warning), light theme on a grey page with white cards (USWDS is light-first and projectors kill dark, the dark header is the one exception), the faces (Public Sans plus Roboto Mono for machine text, v4), and the stale thresholds (already in `encode.ts`).

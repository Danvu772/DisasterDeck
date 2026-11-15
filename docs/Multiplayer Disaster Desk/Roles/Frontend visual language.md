---
tags: [hackathon, frontend, design]
status: draft, Dan decides every value marked DECIDE
---
# Frontend visual language

Read with: [[Role 3 - Frontend]] · [[Team contracts]] · [[Final system design]]

## Background

Every screen in this app answers the same five questions about a thing on the desk: **how bad is it, how sure are we, how old is it, who is on it, and where is it.** The data model already answers all five (`tier`, `confidence`, `observedAt`, `assignee`/`history`, `coords`). The visual language is just a fixed mapping from those fields to what the eye sees, so a judge who has watched the board for 30 seconds can read any card on any screen.

The rule that makes it work is **one field, one visual channel, never shared.** If red means "tier 0" on the board but "closed road" on the map and "error" in the chat, nobody can read red anymore. Bertin figured this out in 1967 (duh), most dashboards still ignore it.

The second rule: **the machine and the people look different.** This is a multiplayer AI product. The judges have to see at a glance which line came from a person, which from an agent, and which from a plain-code rule.

---

## The encoding table

This table is the visual language. Everything else is layout. It lives in code as `components/encode.ts` (see below) so no component picks its own colour.

| Data | Visual channel | Values | Notes |
|---|---|---|---|
| **Act-now** (tier 0, overdue task, critical incident, health > 30 s) | Hue: the only saturated red in the app | red / nothing | Red means "a person should act now". Nothing else is ever red. DECIDE the exact red |
| `tier` | Hue + a left bar on the card | 0 red, 1 amber, 2 neutral grey | Tier always wins, so it gets the strongest channel |
| `confidence` | Line style of the card border | `unconfirmed` dashed, `corroborated` thin solid, `confirmed` thick solid | Plus the word on hover. Never colour, colour is taken |
| `observedAt` age | Text stamp + ink opacity | "4 min ago" full ink, stale drops to ~50% and gets the word "stale" | Stale threshold per record type. DECIDE (shelters ~30 min, the Instagram whiteboard was 2 h old) |
| `source` | Small glyph + word | X, IG, FB, sheet, NASA, person, system | Always next to the number it backs: "58/60 · IG · 4 min ago" |
| actor kind (person / agent / rule / satellite) | Typeface | People in sans. Agent and rule output in mono | The cheapest multiplayer cue there is. History lines, agent replies, stamps are mono |
| `status` | Position (column, order) + a text chip | lifecycle words from `types.ts` | Chips are neutral. Status never gets a colour of its own |
| `priority` score | Small tabular number | "0 · 84" | Click it to see the breakdown: 10×sources + minutes + 30 silent zone + 20 cold. This is how judges see "who decides priority" |
| `proposed` need | Grey card + progress dots | "● ○ ○  1 of 3 asked" | |
| NASA silent / cold zone | Hatch pattern on the map, never a fill colour | hatch + legend line "Sentinel-1, 10 Feb 2023, NASA JPL ARIA" | Satellite only ever raises priority, so it shows as "+30" in the score breakdown |
| phone number | Masked text | `•••• •• 42` | Unmasked only inside the caller's own task |

Three colours carry meaning (red, amber, the NASA hatch). Everything else is ink on paper. If a fourth colour shows up, something is wrong.

---

## Primitives

Every screen is built from these and nothing else. If a screen needs something new, it becomes a primitive first.

| Primitive | What it draws |
|---|---|
| `TierBar` | the left bar, from `tier` and act-now |
| `Stamp` | `source · age`, mono, fades when stale |
| `RecordCard` | site / need / road / shelter / incident. Composes TierBar, border from confidence, Stamp, status chip, score |
| `TaskCard` | a RecordCard plus Accept / Decline / Done / Problem |
| `HistoryDrawer` | `history[]` as a timeline, actor typeface per line |
| `ChatPanel` | person in sans, agent in mono, each event the agent posted linked as a chip |
| `HealthLine` | "queue: 3 waiting, oldest 2 s" |
| `MapLayer` | pins use the same TierBar colour, zones use the hatch |

---

## How to prototype fast and keep control

1. **Tokens live in one file.** `app/globals.css`, Tailwind v4 `@theme` block. Colours, type, spacing, radii. Changing a value here changes the whole app. Nobody writes a hex anywhere else.
2. **The encoding table is code.** `components/encode.ts` exports `tierClass(t)`, `confidenceBorder(c)`, `isStale(type, observedAt)`, `ageText(observedAt)`. Components call these, they never write `bg-red-600` themselves.
3. **Fixtures with the nasty states.** `fixtures/board.json`, typed against `lib/types.ts`. It must hold the ugly cases: a stale shelter, a proposed need at 1 of 3, an escalated task, a critical incident, a site with 4 sources, a Turkish tweet with its `textEn`.
4. **A `/lab` page.** Every primitive in every state on one screen, from the fixtures. This is the design review surface. Change a token, refresh, look at everything at once. No Storybook, it's a hackathon.
5. **New screen ideas go in `app/lab/<name>/page.tsx`.** Compose primitives over fixtures. Try variants side by side with `?v=a` / `?v=b`. Promote to the real route once it reads right.
6. **A guard script.** `npm run check:tokens` greps `app/` and `components/` for raw hex and raw Tailwind colour classes outside `globals.css` and `encode.ts`, and fails if it finds any. This is what keeps the language yours when three people and an agent are pushing code at 03:00.

## Open decisions (DECIDE)

- Exact red and amber (they must survive a washed-out projector).
- Light or dark. Projectors kill dark themes, so light is the safe default.
- Sans and mono faces (Inter + JetBrains Mono is the boring safe pair).
- Stale thresholds per record type.
- Density on the board: how many cards fit before "no scrolling for the main thing" breaks.

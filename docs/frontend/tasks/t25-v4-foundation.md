---
id: t25-v4-foundation
effort: high
checkpoint: redesign
files: app/globals.css, app/layout.tsx, components/Nav.tsx, components/HealthLine.tsx, components/encode.ts, new components/StatusPill.tsx, package.json (check:tokens only), docs/Multiplayer Disaster Desk/Roles/Frontend visual language.md
---
# Visual language v4: USWDS values, v2 look. Tokens, fonts, dark header

Read `docs/frontend/DECISIONS.md` first. This task lays the foundation every screen task after it builds on. Do not restyle individual screens here (t26 to t30 do that), only what every page shares.

Reference: Ömer's v2 look. Read `git show origin/redesign/v2:app/v2/theme.css` and `git show origin/redesign/v2:components/v2/ui.tsx` (TopBar, TierBadge, Chip). Take the composition, not the values.

## 1. Tokens (`app/globals.css`), USWDS 3 values only, each commented with its USWDS token name
- Keep every existing token name and meaning (act, act-soft, urgent, calm, primary, primary-dark, primary-lighter, focus, hatch, ink, muted, line, card, paper).
- `paper` becomes USWDS `base-lightest` (#f0f0f0): v2 puts white cards on a light grey page.
- New: `night` = `base-darkest` (#1b1b1b), header background. `night-ink` = white. `night-muted` = `base-light` (#a9aeb1), muted text on the header.
- New: `ok` = `success-dark` (#4d8055) and `ok-soft` = `success-lighter` (#ecf3ec). The only use: the healthy queue pill. Nothing else may be green.
- Radii: `card` stays USWDS `lg` (0.5rem). New `pill` = USWDS `pill` (99rem) for chips and pills.
- Shadows: none (USWDS cards are flat with a border).

## 2. Fonts (`app/layout.tsx`, `globals.css`)
- Public Sans (`next/font/google` `Public_Sans`) for all text, headings included.
- Roboto Mono (`Roboto_Mono`) as `font-mono`, **only** for ids, times, scores, counts in pills and machine output. Write that rule in a comment next to the token.
- `package.json` `check:tokens`: drop `font-mono` from the banned list (keep `font-serif` banned). Also make it scan `*.css` files under `app/` and `components/` except `app/globals.css`, so no stray hex hides in a CSS file again (v2's `theme.css` had 42).

## 3. Dark header (`components/Nav.tsx`)
v2's TopBar composition on USWDS tokens:
- Left: the v2 logo mark (inline SVG, `currentColor`), "Disaster Desk", and a pill "Malatya exercise, synthetic data" (`night-muted` border).
- Role tabs: Desk, Agent, Map, Coordinator, Field. Current tab: white pill with ink text (`aria-current="page"`). Others: `night-ink` text, hover underline. Keep "Design lab" at the far right, muted.
- Right: who is acting (`?user=` or the signed-in name, as a pill) and the queue status pill (`components/StatusPill.tsx`): polls `GET /api/health` every 5 s through `usePolled`. Text: "Brain running, queue 0" (ok colours), or "Brain not running, queue 1, oldest 29 min" / "The desk is not answering" (act colours, because a person must act). A Brain counts as running when `lastLoopAt` is under 30 s old. Times in mono.
- The `account` prop (`Account.tsx`, sign in/out) stays, styled for the dark bar.
- Phone: the tab row scrolls sideways (as now), the pills drop below `sm` except the status dot.
- `HealthLine.tsx`: keep it exported (screens still use it), but restyle it to match the pill so both say the same thing.

## 4. `encode.ts`
Add the shared v2-style pieces, built from tokens: `chip(active)` (filter chip, pill radius, primary border when active), `pill` (neutral), `tierBadge` text forms ("T0", "T1", "T2" in mono plus the tier word). Keep every existing export working.

## 5. Visual language doc
Add a "v4 (15 Nov, Dan)" section at the top of `Frontend visual language.md`: what changed from v3 (Public Sans + Roboto Mono, mono allowed only for ids/times/scores, grey page, dark header, `ok` green only for the healthy pill), with a link to `docs/frontend/DECISIONS.md`. Keep the encoding table.

Accept when: every existing page renders with the dark header and Public Sans, the status pill shows "Brain not running, queue 1, oldest N min" in act colours against the current Atlas, and tsc, eslint and the extended check:tokens pass.

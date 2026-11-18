---
name: desk-design
description: The Disaster Deck visual system on USWDS 3 (D-0001, Nov 2026) — react-uswds components, USWDS design tokens, Public Sans, the shared shell, Tailwind 4 for layout only, axe in CI. Load before writing or changing any screen, component, map layer or copy in app/ or components/.
---

# Disaster Deck design system (USWDS, D-0001)

Agencies buy tools that pass Section 508 and look like government software, so every screen is
built on the **U.S. Web Design System 3** (`@uswds/uswds` 3.14) through **react-uswds**
(`@trussworks/react-uswds` 13, React 19, "use client" bundle). Next.js App Router and React stay.
Decision: `docs/decisions/0001-frontend-uswds.md`. Requirement: `UI-1` in `tests/requirements.json`.

The hackathon screens (shadcn/ui, Geist, motion) still run inside the new shell until #16, #17 and
#18 rebuild them. Don't extend that look: anything new follows this file.

## 1. Where things live

| What | File |
|---|---|
| USWDS theme: every colour, font and shape setting, as USWDS tokens | `app/uswds.scss` |
| Which USWDS packages compile (all of them except its utilities) | `app/_uswds-packages.scss` |
| Tailwind 4 + the `usa-*` colour mapping + the old shadcn tokens | `app/globals.css` |
| The shell: skip link, header, primary nav, footer | `app/layout.tsx`, `components/shell/` |
| The six screens, in nav order | `components/shell/screens.ts` |
| Login page (USWDS) | `app/login/page.tsx` |
| Production stand-in for motion | `components/motion/static.tsx`, `next.config.ts` |
| Accessibility test (axe) | `e2e/tests/a11y.spec.ts`, `e2e/playwright.a11y.config.ts` |

## 2. Components first

1. **A react-uswds component** when one exists: `Button`, `Alert`, `Card`, `Tag`, `Table`, `Modal`,
   `Fieldset`, `Label`, `TextInput`, `Select`, `Radio`, `Checkbox`, `StepIndicator`, `SummaryBox`,
   `Accordion`, `SideNav`, `ProcessList`, `Icon`. Import from `@trussworks/react-uswds`.
   They are client components; a server page can render them with plain props.
2. **USWDS markup and classes** (`usa-button`, `usa-tag`, `usa-alert`...) when the component needs a
   different element, e.g. a Next `<Link className="usa-button usa-button--outline">`.
   Check the markup against designsystem.digital.gov/components.
3. **A small local component** under `components/` built from USWDS classes, when neither fits.

Never install another component kit. `components/ui/*` (shadcn) is legacy: do not use it in new code.

## 3. Tokens, never values

- Colour, type, spacing and radius come from USWDS tokens. In Sass: `usa.color("primary")`,
  `usa.units(2)`, `usa.font-size("ui", "sm")`, `usa.radius("md")`. In markup: the Tailwind colours
  mapped from them, `bg-usa-primary`, `text-usa-ink`, `border-usa-base-lighter` (full list:
  `--color-usa-*` in `app/globals.css`).
- Never write a hex, rgb or oklch value, or a Tailwind palette name (`red-500`, `white`, `gray-…`),
  in app/ or components/. `npm run check:tokens` must exit 0.
- To change the theme, change a `$theme-*` setting in `app/uswds.scss` to another USWDS system
  token (`"blue-warm-60v"`), then export it in `:root` and map it in `globals.css` if markup needs it.

The theme (not flat government gray):

| Role | Token | Means |
|---|---|---|
| `primary` family | blue-warm (60v; dark 70v, darker 80v, darkest 90) | you can act here: buttons, links, current page |
| `secondary` family | orange-warm (50v) | signal: the exercise label, attention that is not an error |
| `base` family | gray-cool | structure: lines, quiet fills, secondary text |
| `ink` | gray-cool-90 | text |
| `error`, `warning`, `success`, `info` | USWDS defaults | state only: act now, urgent, healthy, the agent |

Contrast: USWDS grades make it checkable. Text and background grades must differ by **50 or more**
for normal text (AA), 40+ for large text. axe in CI checks it on the shell.

## 4. Type and shape

- Public Sans everywhere (USWDS serves it from the app, no Google Fonts); Roboto Mono only for numbers
  that line up (counts, times, scores).
- Use USWDS type classes (`usa-intro`, `usa-prose`) or Tailwind size utilities; headings in order,
  one `h1` per page.
- Buttons and inputs: USWDS sizes (44 px touch targets). Radius: `md`.

## 5. Tailwind 4 next to USWDS

- **USWDS = components and tokens. Tailwind = layout utilities** (flex, grid, gap, padding, width,
  responsive variants). USWDS's own utility classes (`.margin-0`, `.bg-primary`, `.text-white`) are
  NOT compiled: their names collide with Tailwind's. Write `m-0`, not `margin-0`.
- Cascade layers, declared at the top of both stylesheets:
  `properties < theme < base (Tailwind preflight) < uswds < components < utilities`.
  USWDS components beat Tailwind's reset; a Tailwind utility on an element beats USWDS. So add a
  utility to adjust a USWDS component; don't fight it with `!important`.
- Name custom shell classes `dd-*` and put them in the `@layer uswds` block of `app/uswds.scss`.

## 6. The shell

`app/layout.tsx` renders, on every page: the USWDS skip link (`#main-content`), `SiteHeader`, the
page, `SiteFooter`. The page and the footer scroll together under the header, so a full-height
screen (`h-full`) still fills the window.

- **No `.gov` banner** (`GovBanner`, `usa-banner`): Disaster Deck is not a government website.
  The a11y test fails if one appears.
- Primary nav: the six screens of `components/shell/screens.ts` (Desk, Field, Talk, Coordinator,
  Map, Ops), `aria-current="page"` on the current one. Below 1024 px it is the USWDS drawer behind
  the Menu button (Escape and navigation close it).
- Header tools (inbox, account, desk health, theme toggle) use `usa-*` colours: the header stays
  light in both themes.
- A screen renders its own `<main>`. Don't add another landmark of the same kind.

## 7. Motion

- No motion library in new code. USWDS components animate where USWDS does; a CSS transition is
  fine and must stop under `prefers-reduced-motion`.
- `motion` (`motion/react`) and `liquid-gooey` are demo-only (D-0001). `liquid-gooey` is removed.
  A build without `DEMO_MODE=1` aliases `motion/react` to `components/motion/static.tsx` (same
  elements, no animation); `npm run check:bundle` fails if motion's runtime is in such a build.
  The shell imports no motion at all.

## 8. Icons, words, maps

- Icons: USWDS `Icon` (react-uswds) for interface icons in new code. Map "things" stay the Koboyo
  set (`components/icons/koboyo.tsx`, picked through `components/icons/things.ts`), so the map, the
  list and the legend show the same icon. No emoji as icons.
- Words: English, short, plain language. Never show internal ids, raw keys, coordinates, underscores
  or `T0/T1/T2` codes. Tier words: "Life-threatening", "Urgent", "Can wait".
- Maps: MapLibre only (D-0006), `components/map/gl/`. Paint needs real colours: read the raw CSS
  var through `components/map/gl/tokens.ts`.

## Checklist before done

`npx tsc --noEmit` · `npx eslint` · `npm run check:tokens` · `DEMO_MODE=0 npx next build` then
`npm run check:bundle` · `cd e2e && npm run test:a11y` (no serious or critical axe violations) ·
look at it at 1440 px and 390 px, keyboard only (Tab from the top hits the skip link first).

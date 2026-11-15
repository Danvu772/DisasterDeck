---
name: desk-design
description: The Disaster Desk visual system (theme v5, 15 Nov 2026) — shadcn/ui neutral on the Obra shadcn kit, Geist, Lucide, motion. Load before writing or changing any screen, component, map layer or copy in app/ or components/.
---

# Disaster Desk design system (v5)

One look for every screen: **shadcn/ui "neutral"** (the Obra shadcn/ui kit, Community edition, MIT),
**Geist** type, **Lucide** icons, **motion** (`motion/react`) for movement, **MapLibre** for maps.
Calm, grey and white; colour only where it carries meaning.

## 1. Colour = meaning (tokens only)

All values live in `app/globals.css`. Never write a hex, rgb, oklch or a Tailwind palette name
(`red-500`, `white`, `gray-…`) in app/ or components/. `npm run check:tokens` must exit 0.

| Token (class)                                   | Means                                                    |
|-------------------------------------------------|----------------------------------------------------------|
| `background`, `card`, `paper`                   | surfaces: page = `bg-paper`, panels = `bg-card`          |
| `foreground`, `muted-foreground`                | text, secondary text                                     |
| `primary` / `primary-foreground`                | the one main action, selected chip                       |
| `secondary`, `accent`                           | quiet fills, hover                                       |
| `border`, `input`, `ring`                       | lines, fields, focus                                     |
| `destructive` / `destructive-foreground` / `destructive-soft` | **act now**: tier 0, critical, overdue. Nothing else is red |
| `warning` / `warning-foreground`                | tier 1, urgent                                           |
| `calm`                                          | tier 2                                                   |
| `success` / `success-soft`                      | healthy system state only                                |
| `info` / `info-foreground` / `info-soft`        | the agent (its voice, its answers). Nothing else is blue |

**Trap:** in this app `muted` (the v4 alias `text-muted`) is muted TEXT. For shadcn's grey fill
write `bg-secondary`, never `bg-muted`. New code writes `text-muted-foreground`.
Old v4 names (`ink`, `line`, `act`, `urgent`, `ok`, `night*`) still resolve; prefer the shadcn names.

Dark mode: `.dark` on `<html>` (toggle in the nav). Every token has a dark value; test both.
Canvas or MapLibre paint needs real colours: read the raw CSS var (`--destructive`, not
`--color-destructive`) through `components/map/gl/tokens.ts`.

## 2. Type

- Geist Sans everywhere; Geist Mono only for numbers that line up (counts, times, scores, ids if ever shown).
- Sizes: page title `text-xl font-semibold tracking-tight`; card title `text-sm font-semibold`;
  body `text-sm`; meta `text-xs text-muted-foreground`. No `uppercase` labels, no `font-bold` walls.

## 3. Space and shape

- Radius from `--radius` (0.625rem): `rounded-md` controls, `rounded-lg`/`rounded-xl` cards, `rounded-full` chips.
- Cards: `rounded-xl border bg-card shadow-xs`. Gaps: 2/3/4 (8/12/16 px). Page padding `p-4 md:p-6`.
- One quiet border per surface; no double borders, no heavy outlines.

## 4. Components

- `components/ui/*` (shadcn): Button, Badge, Card, Avatar, Input, Separator, Skeleton, Tooltip.
  Use them for new UI. Button variants: default, outline, secondary, ghost, destructive, link; sizes xs/sm/default/lg/icon*.
- `components/encode.ts`: `chip(active)`, `pill`, `statusTag`, `button.{primary,outline,act}`,
  `tierBadge(tier)`, `tierBar(tier)` — same shapes as shadcn, for existing code.
- `components/motion/*` (adapted from Watermelon UI, tokenized): `ExpandablePersonCard`,
  `PinnedList`, `IntensitySlider`.
- Icons: `lucide-react` only, `size-4` in text, `size-5` in big buttons. No emoji as icons, no react-icons.

## 5. Words

- English everywhere on screen.
- Short. One line of help at most per screen; no paragraphs explaining how the screen works.
- Never show internal ids (`site-6af9…`, `task-5`), raw keys (`callStatus`), coordinates,
  underscores, `T0/T1/T2` codes, or source plumbing. Say what a person needs: what, where, how bad, how long ago, what to do.
- Tier words: "Life-threatening", "Urgent", "Can wait" (`TIER_WORD` in detail/fields.ts).

## 6. Motion

- `motion/react`, springs (`stiffness 300–400, damping 30–40`). Lists: `layout` + fade/scale 0.95.
- Map: life-threatening markers breathe (`.marker-pulse`), hazards glow (`.marker-glow`), new criticals ring once.
- Everything respects `prefers-reduced-motion` (CSS block at the end of globals.css).

## 7. Maps

`components/map/gl/DeskGlMap.tsx` (MapLibre GL + react-map-gl). Vector basemap (CARTO Positron /
Dark Matter, follows the theme) or satellite. Layers: records (sites, problems, shelters, roads),
hazards, destroyed buildings (OSM/HOT, 3D), USGS quakes. Clicking a marker shows a small card with
human words only (what, how bad, people, when, sources) — never a raw field dump.
The Leaflet NASA imagery view stays in `components/map/DeskMapView.tsx` (Role 4) as the "Imagery" mode on /map.

## Checklist before done

`npx tsc --noEmit` · `npm run lint` · `npm run check:tokens` · look at it in light and dark.

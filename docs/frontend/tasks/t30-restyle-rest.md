---
id: t30-restyle-rest
effort: medium
checkpoint: redesign
files: components/map/DeskMapView.tsx (list column and legend styling only), app/map/page.tsx, app/compare/page.tsx, components/compare/*, app/login/page.tsx, components/Account.tsx, app/lab/page.tsx
---
# Map, compare, login, lab: v4 styling

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

No v2 equivalents exist, so this is styling only. Grey page with white cards, v2 row style in the `/map` list (tier badge in mono, kind and id in mono, then the title, same as the t26 board list), pill-style legend and status chips, Public Sans headings. `/compare` must still fit 1280 by 720 without scrolling. `/login` is a centred white card on the grey page. `/lab` shows the new pieces (status pill, chips, tier badges) next to the old primitives. No behaviour changes.

# design-sync notes (disaster-desk)

This is a Next app, not a published library. No dist/, no Storybook. Everything below exists to make the converter treat `components/` as a package.

## How the build works here

- Always run `cfg.buildCmd` first: `node .design-sync/build-css.mjs && ./.design-sync/build-types.sh`.
  - `build-css.mjs` compiles Tailwind v4 from `.design-sync/tailwind.src.css` (imports `app/globals.css`, scans `components/`, safelists every token + a layout vocabulary) into `.design-sync/.cache/ds.css` = `cfg.cssEntry`.
  - `build-types.sh` runs tsc with `.design-sync/tsconfig.json` into `dist/types/` (gitignored), rewrites `@/` imports to relative, and writes `dist/types/index.d.ts` from every PascalCase component module.
- Every converter/driver run needs `--entry ./dist/index.js`. That file does not exist ON PURPOSE: it makes PKG_DIR the repo root and forces synth-entry mode. Without `--entry` the converter looks for `node_modules/disaster-desk` and crashes.
- `--node-modules ./node_modules`.
- `.design-sync/overrides/dts.mjs` is forked (declared in `libOverrides`): with no `"types"` in package.json, upstream reads `<repo>/index.d.ts`. The fork falls back to `dist/types/index.d.ts`. Fresh clone: `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` so the fork resolves ts-morph.
- `next/link` and `next/navigation` are aliased to `.design-sync/shims/` via `.design-sync/tsconfig.json` paths. Without it the bundle pulls in all of next (251 KB vs 33 KB) and `Nav` crashes on `usePathname()` = null.
- GOTCHA: the converter's tsconfig reader strips `/* */` with a regex. Any `**/` in that tsconfig (e.g. an include glob) plus `"@/*"` eats the JSON and the paths silently vanish. Keep include as plain dirs.
- Fonts: Source Sans 3 only (Merriweather dropped 14 Nov) via Google Fonts `@import` in `tailwind.src.css`, and `:root` defines `--font-source-sans` (the app gets it from next/font on body). `[FONT_REMOTE]` is expected.
- Playwright: `playwright@1.62.0` in `.ds-sync/` matches the cached `chromium-1234` in ~/Library/Caches/ms-playwright.
- Changing `cfg.overrides` needs a full `package-build.mjs`; `preview-rebuild.mjs` refuses with `[CONFIG_STALE]`.

## Previews

- All 17 authored in `.design-sync/previews/`, built from `fixtures/board.ts` and `fixtures/desk.ts` (imported through `@/fixtures/*`). Times are relative to `Date.now()`.
- Put each description comment BELOW its export. The example extractor attaches trailing comments to the export above them.
- `AgentDesk` is `cardMode: single` (1100x800). `BoardTabs` and `Nav` are `cardMode: column`.
- `History` "Open" story opens the `<details>` with a ref callback. Hover states are not previewed.

## Known render warns

- none

## Component findings (not sync issues, for the frontend)

- `RecordCard` prints `status` raw, so chips read `on_the_way`, `team_on_site`, `waiting_approval`. `YourNeeds` already does `replaceAll("_", " ")`.
- The `RecordCard` footer is tight: a stale stamp wraps onto two lines (`48 min / ago STALE`) at ~380px.

## Re-sync risks

- `dist/types` and `.cache/ds.css` are build outputs. If buildCmd is skipped, the converter uses stale types/CSS silently.
- The conventions header copies the data shapes and the class vocabulary by hand. When `lib/types.ts` or the safelist in `tailwind.src.css` changes, update `conventions.md`.
- The guideline doc `docs/Multiplayer Disaster Desk/Roles/Frontend visual language.md` was untracked at first sync. If it moves, update `guidelinesGlob`.
- The `dts.mjs` fork is based on design-sync 2.1.325. Diff it against the bundled lib on re-sync.
- The shims hardcode `usePathname() === "/"`, so `Nav` always shows Desk as active in designs.

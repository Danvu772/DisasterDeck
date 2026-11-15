---
id: t43-e2e-headless
effort: high
checkpoint: testing
files: new e2e/ folder only (its own package.json, playwright.config.ts, tests/*.spec.ts, README.md), .gitignore (e2e output folders only)
---
# Headless workflow tests that you can still watch afterwards

Dan: "Can we have a dedicated, headless yet visual thing that does automated workflow testing?" No window may ever open on his screen (rule in `~/.claude/CLAUDE.md`). The tests run headless and leave something visual to look at afterwards: video, screenshots and a trace per test, plus an HTML report.

## Setup (only inside `e2e/`)
- `e2e/` is its own small package so the root `package.json` stays untouched (another session has uncommitted edits there). `e2e/package.json` with `@playwright/test` as a dev dependency. You may run `npm install` and `npx playwright install chromium` **inside `e2e/` only**.
- `playwright.config.ts`: Chromium only, `headless: true` (never false, write a comment why), `baseURL` from `BASE_URL` (default `http://127.0.0.1:3000`, the dev server in tmux `dd:dev`, already running), `video: "on"`, `screenshot: "on"`, `trace: "on"`, reporter `[["list"], ["html", { open: "never", outputFolder: "report" }]]`. Two projects: laptop 1440 by 900 and phone 390 by 844.
- `.gitignore`: add `e2e/test-results/`, `e2e/report/`, `e2e/node_modules/`.
- Scripts in `e2e/package.json`: `test` (run all), `test:smoke` (the fast subset), `report` (prints the path of `report/index.html`; it must not open a browser).

## Workflows to cover (one spec file each), demo mode on localhost
1. `board.spec.ts`: `/` loads, the header status pill shows, the list, map and detail columns render, clicking a list row selects it in the detail column, `?open=` deep link works, Ask the desk "how full are the shelters?" shows a shelter metric card.
2. `agent.spec.ts`: `/agent?user=volunteer-callback` loads, the desk feed shows items, clicking one opens its report and Back returns, sending a chat question shows either the agent text or the error sentence in the chat box and a metric chart (inline today, or the animation space once t42 lands: accept either).
3. `coordinator.spec.ts`: `/coordinator` loads with its sections. The Modify picker opens and lists people.
4. `field.spec.ts` (phone project): `/field` shows the task card, the big buttons and "Your other tasks" when there are several.
5. `map.spec.ts`: `/map` renders markers and the legend, `?focus=` selects a record.
6. `security.spec.ts`: a request with an `x-forwarded-for: 1.2.3.4` header to `/coordinator` ends on `/login`, and `/api/board` with that header answers 401. Locally both work.
- **Never write to the real desk.** No clicks that post events for real task ids. Demo tasks (Option B) and fake ids are fine. Read-only checks otherwise.
- Tag the fast ones `@smoke`. Keep the whole suite under 2 minutes.
- Selectors by role and visible text where possible, so the tests survive restyles.

## README
`e2e/README.md`: how to run it, where the video, screenshots and traces land, how to open a trace (`npx playwright show-trace <zip>`, which Dan opens himself when he wants to watch), and that it never opens a window.

Accept when: `npm test` in `e2e/` passes (or the failures are real app bugs, listed in your report with their screenshots' paths), and no browser window opened while it ran.

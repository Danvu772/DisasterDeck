# Headless workflow tests

Playwright drives Chromium against the dev server that already runs in tmux `dd:dev`. Chromium is always headless, so a run never opens a window. You watch it afterwards instead: every test leaves a video, screenshots and a trace, and the whole run leaves an HTML report.

## Run it

```bash
cd e2e
npm install                    # once
npx playwright install chromium   # once, downloads the headless browser
npm test                       # every test, 15 to 25 seconds on a warm dev server
npm run test:smoke             # the fast @smoke subset
npm run report                 # prints the path of report/index.html, opens nothing
```

`BASE_URL` points it at another server, `BASE_URL=http://127.0.0.1:3001 npm test`. The default is `http://127.0.0.1:3000`.

**Flaky against the dev server?** When another browser has the desk open, the dev server recompiles as that browser moves between pages, and every recompile refreshes the page under test. A page that refreshes before it hydrates never polls, so its test times out on server-rendered text. That is what made the field tests fail at random on 15 Nov. For a stable run, stop the dev server and test a production build: `npm run build && npm start` in the repo root, then `npm test` here. 19 of 19 passed five times in a row that way. Restart the dev server afterwards.

## Accessibility (UI-1, runs in CI)

`tests/a11y.spec.ts` runs axe on the USWDS shell (skip link, header, nav, footer) of the six screens and on the whole `/login` page, and fails on any serious or critical violation. Its own config starts `next start` on a production build, port 3100, with `DEMO_MODE=1` and no database:

```bash
npx next build                 # in the repo root
cd e2e && npm run test:a11y    # CHROME_PATH=/usr/bin/google-chrome to use an installed Chrome
```

The plain `npm test` above picks the spec up too, against the dev server.

## What it covers

Two projects, laptop (1440 by 900) and phone (390 by 844). `field.spec.ts` and `field-voice.spec.ts` run on the phone, the rest on the laptop.

| Spec | Checks |
| --- | --- |
| `board.spec.ts` | `/` with its status pill, list, map and detail, a list row click, the `?open=` deep link, Ask the desk about shelters shows the shelter card |
| `agent.spec.ts` | `/agent?user=volunteer-callback` feed, a feed item opens its report and Back returns, a chat question gets an answer (or the error sentence) and a metric chart |
| `coordinator.spec.ts` | `/coordinator` sections, the Modify picker opens and lists people |
| `field.spec.ts` | `/field` task card, the four big buttons, Your other tasks |
| `field-voice.spec.ts` | Hold to talk sends an ElevenLabs voice note and lists what the agent did, voice agent mode hears a sentence from a fake microphone and answers, the fallback without ElevenLabs. `/api/chat` is answered in the test, so no credit is spent |
| `map.spec.ts` | `/map` markers and legend, `?focus=` selects a record |
| `security.spec.ts` | a request with `x-forwarded-for: 1.2.3.4` ends on `/login` for `/coordinator` and gets 401 from `/api/board`, and both work from the laptop |

## It never writes to the real desk

The content tests answer `/api/board`, `/api/events` and `/api/users` from the repo's `fixtures/` (see `tests/desk.ts`), so they pass whatever the live desk holds, and every other non-GET call to `/api` is aborted. The chat is answered in the test too (`tests/chat.ts`), because a real `POST /api/chat` saves to the person's history and spends the Anthropic key. `E2E_LIVE_CHAT=1 npm test` lets the chat reach the real agent. The layout smoke tests for `/` and `/coordinator` and the security tests read the live server.

## Where to look afterwards

- `report/index.html`: the HTML report, one entry per test with its video, screenshots and trace attached.
- `test-results/<test name>-<project>/`: `video.webm`, the screenshots, `trace.zip`, and for a failure `test-failed-1.png` and `error-context.md` (the page as text at the moment it failed).

To step through a test frame by frame, with every click, network call and DOM snapshot:

```bash
npx playwright show-trace test-results/<test name>-<project>/trace.zip
```

That one does open a window, so you run it yourself when you want to watch. The tests never call it.

Both output folders are wiped and rewritten on every run, and git ignores them.

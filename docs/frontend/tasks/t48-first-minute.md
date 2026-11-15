---
id: t48-first-minute
effort: medium
checkpoint: judging
files: new components/FirstMinute.tsx, app/agent/page.tsx, app/coordinator/page.tsx, app/field/page.tsx (one line each to mount it)
---
# "A stranger can use it in a minute" (Devpost judging criterion)

Add a small, dismissible one-minute guide on the four role screens. One component, `components/FirstMinute.tsx`, with a short text per screen, shown once per browser (remember dismissal in `localStorage`, wrapped in try/catch) and reopenable from a small "How this screen works" link.

- `/agent`: "You talk to your own agent. Ask it anything about the desk, or tell it what happened. Numbers come with a chart on the right."
- `/coordinator`: "Risky work waits here for you. Approve, send someone else, or reject. Everything you decide goes into the record."
- `/field`: "Your current task is on top. Press On our way, Arrived, Done. Red Problem if something goes wrong. Hold to talk."

Three lines at most per screen, v4 tokens, an outline Close button, never covering the main action (a slim banner under the header). Respect reduced motion. Do not touch the screens' other content.

## Change, 02:20
Not on `/` (the desk). Task t50 keeps the desk to a limited feature set, so the guide goes on `/agent`, `/coordinator` and `/field` only. If your partial work already touched `app/page.tsx`, revert that file.

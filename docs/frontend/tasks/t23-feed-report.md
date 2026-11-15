---
id: t23-feed-report
effort: medium
checkpoint: polish
files: components/AgentDesk.tsx (feed column only), components/EventRow.tsx, new components/event/*
---
# Click a desk feed entry, get its report

Dan: "on the desk feed, we need to be able to click on the feed and it opens up a report."

The desk feed is the left column of `/agent` (`AgentDesk`, one `EventRow` per event). Every event is a fact entering the desk. The report shows what came in and what the desk did with it. This is how a judge sees the Brain working.

## Behaviour
- Every feed row is clickable (whole row, plus Enter/Space when focused, a visible focus ring, `hover` like the board cards). Clicking opens the event's report **in the feed column itself**: the list is replaced by the report, with a "Back to feed" button (outline) at the top. Nothing covers the agent column on the right. Escape goes back too.
- The URL gets `?event=<id>` (keep `?user=`), so a link opens the same report. Use `history.replaceState`, as the board's `?open=` does.
- Going back restores the feed's scroll position.

## The report, in this order
1. **Headline:** the same line the row shows (English), the original text muted under it, and a status tag (`pending`, `working`, `done`, `merged`, `rejected`, `failed`, from `statusTag`).
2. **Who and when:** actor (bold name, the id muted), source in words (reuse `SOURCE_LABEL` from `Stamp.tsx`), "Observed" (`observedAt`, when it was true) and "Received" (`ts`, when the desk got it) as age plus exact time. When the two differ by more than 5 minutes, say so plainly: "Observed 2 h before the desk got it." (the Lahaina whiteboard problem). Lane in words: lane 0 "a person on the desk, read first", lane 1 "an outside source".
3. **What it said:** every payload field in plain labels, one map per event type in `components/event/fields.ts` (report, need, closure, capacity, answer, approval, alert, incident, claim, correction, plan, see `lib/types.ts`). Unknown fields render under their raw key. Masked phones stay masked.
4. **What the desk did:** `result.reason` as a sentence, `dedupeKey` muted, attempts when above 0. For `merged`, say "Merged into an existing record". For `failed` or `rejected`, act-red text only if it needs a person (failed), muted otherwise.
5. **Records it touched:** each id in `result.recordIds` as a link to the board panel, `/?open=<kind>:<id>`. Work out the kind in a pure function `recordKind(event)` in `components/event/recordKind.ts`: report goes to site, need to need, closure to road, capacity to shelter, incident to incident, alert to zone, answer and approval point at `payload.taskId` as a task. When an id cannot be mapped, show it as plain text.

## Data
Events come in as props today (fixtures from `makeEvents`). There is no `GET /api/events` yet. Write the report against the `Event` type so a future endpoint plugs in, and put "Request to Role 1: GET /api/events?since=" in your report.

Do not touch the agent column, `YourNeeds.tsx` or `fixtures/` (another session is editing them).

Accept when: each fixture event opens a report, the Instagram capacity event says it was observed about 2 h before the desk got it, and the report's record links open the right card on `/`.

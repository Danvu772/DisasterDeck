---
id: t24-field-task-list
effort: medium
checkpoint: CP3
files: components/field/FieldPhone.tsx, components/field/pickTask.ts, fixtures/field.ts, app/field/page.tsx
---
# Field: pick which of your tasks you are working on

Dan: "for the Field tab, I need the ability to choose different problems." He means the team's own tasks. Today `/field` shows only the best task (`pickTask`, tier then priority). A team with three tasks cannot see or switch to the others.

## Behaviour (phone first, 390 px)
- Under the current task card, a section "Your other tasks (2)". One row per other open task assigned to this user, sorted like `pickTask` (tier, then priority): tier colour bar (`tierBar`), title, address or record name, and how long it has waited or the time left to its deadline ("answer in 4 min", act-red text when overdue). Rows are big tap targets (min 56 px high), full width.
- Tapping a row makes that task the current task: it moves into the big card at the top with all its buttons (On our way, Arrived, Done, Problem, hold to talk). The task that was current drops into the list. Scroll to the top after switching.
- The choice is remembered in the URL as `?task=<id>` (keep `?user=`), so a reload or a link shows the same task. If that task is no longer open (done, cancelled, reassigned), fall back to `pickTask` and show one muted line: "That task is closed, showing your next one."
- With only one task, show no list. With none, keep today's empty state.
- Posts (answer, incident, voice) always carry the current task's id. The offline outbox keeps working per post as today.

## Code
- `pickTask.ts`: export a pure `openTasksFor(board, userId)` (sorted) next to `pickTask`, and use it for both.
- `fixtures/field.ts`: give `field-alpha` at least three open tasks (one rescue, one deliver or assist, one overdue call) so the list shows in demo mode. Do not edit `fixtures/board.ts` (another session works on it).

Accept when: `/field` at 390 px shows the current task plus "Your other tasks (2)", tapping one swaps them, `?task=` survives a reload, and the Problem post carries the chosen task's id.

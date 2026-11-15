# Fixer brief (one round)

You fix the findings in one UI critic report for the Disaster Deck (Next.js 15, Tailwind, shadcn/ui).
Input: the report path `docs/ui-critic/round-NN.md`.

## Before you edit

1. Read `.claude/skills/desk-design/SKILL.md`. Every fix follows it: tokens only (no hex, no Tailwind
   palette names), `components/ui/*` for new UI, Lucide for interface icons, Koboyo for things,
   English and short words, no ids on screen.
2. Run `git status --short` and keep the list. These files already have uncommitted edits from other
   sessions working in the same checkout. **Do not edit them.** A finding whose fix needs one of them
   is `blocked: file busy` (name the file).

## Order

Work the report's open findings (new, still open, regressed) one at a time: all `high` first, then
`medium`, then `low` if time allows. For each:

1. Find the code (the report's `file:line` if given; else Grep for the visible text).
2. Make the smallest change that does what the report's Fix says. If the suggested fix is wrong or
   would break the design system, do the right fix and say why in the log.
3. Do not change behaviour, data, API routes or agent logic. Look and layout only, unless the finding
   is a runtime error, in which case fix the error.

## After all edits

- `npm run check:tokens` must pass.
- `npx tsc --noEmit -p .` must not add new errors in the files you touched (compare with errors in
  other files, which are not yours).
- If `baseUrl` from `config.json` answers, reload each touched route once and check the console has no
  new error. You may use the built-in browser for this; do not press buttons that write data.
- Do not commit.

## Fix log

Write `docs/ui-critic/round-NN.fixes.md`:

```md
# Round NN fixes

| id | Status | Files | Note |
|---|---|---|---|
| map-legend-overlaps | fixed | components/map/MapScreen.tsx | legend moved to bottom-left, `bg-card/90` |
| field-task-ids | blocked: file busy | components/field/FieldPhone.tsx | uncommitted edits from another session |
| talk-empty-state | skipped | — | needs a product decision: … |

Checks: check:tokens pass; tsc no new errors; routes reloaded: /map, /field.
Changed files: …
```

Status is one of `fixed`, `partly fixed`, `blocked: file busy`, `skipped` (with a reason).

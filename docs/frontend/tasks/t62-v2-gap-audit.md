---
id: t62-v2-gap-audit
effort: high
files: new docs/frontend/v2-gaps.md, new docs/frontend/tasks/t63-*.md … (specs only, no code)
---
# /v2 is the demo: list what it's missing from v1, write port specs (#34)

Dan decided (#34): judges see **/v2** (`app/v2/*`, `components/v2/*`, about 1500 lines, Ömer's command-center look). v1 (`/`, `/coordinator`, `/field`, `/agent`, `/map`, components/*) has every workflow built tonight: record detail panel with history, feed reports, field task list, charts in chat (`/agent`, components/agent/VizSpace.tsx), the NASA map, score breakdown popover, case numbers, tier in words, Ask the desk, hold to talk, first paint loading blocks, health pill. Final submission is **today 12:00 EST**. Read docs/frontend/LOG.md and TASKS.md for what v1 got.

Do (read only, write no app code):
1. Walk each v1 screen and each /v2 screen. Write `docs/frontend/v2-gaps.md`: a table of workflow | where it lives in v1 | /v2 has it? | port cost (S/M/L) | demo value (must/nice). Also list /v2 bugs you see (broken fetches, empty states that read as broken, missing nav between v2 screens, no way to reach /agent from /v2).
2. For every "must" gap, write one self-contained task spec `docs/frontend/tasks/t63-<slug>.md`, `t64-…` and so on, in the same format as `docs/frontend/tasks/t53-dispatch-backfill.md` (frontmatter id, effort, files). Each spec must name its exact files, and no two specs may touch the same file, so they can run in parallel. Reuse v1 components inside the v2 look where you can instead of rewriting them. Keep v2's theme (`app/v2/theme.css`).
3. Order the specs by demo value. Aim for the set that fits about 5 hours of parallel workers.

Accept when: v2-gaps.md exists, every must-gap has a spec, and the report lists the specs with the files each one touches.

---
id: t16-fixtures-seed-ids
effort: medium
checkpoint: CP3
files: fixtures/desk.ts, fixtures/board.ts, fixtures/coordinator.ts, fixtures/field.ts, and default ids in app/*/page.tsx and components/**
---
# Fixtures use the same people as the real database

The fixtures invent people (`zeynep`, `team-4`, `supplier-2`, `coord-1`). The real database is seeded from `data/seed.json` (`volunteer-callback`, `field-alpha`, `supplier-primary`, `supplier-backup`, `shelter-desk`, `coordinator-duty`, ...). When `/api/board` answers, every screen that matches tasks to people by id breaks, and `?user=` posts from demo pages get 404 "unknown user".

- Read `data/seed.json`. Map each fixture person to the seed person with the same role and story (Zeynep is `volunteer-callback`, the army team becomes `field-alpha`, Kızılay depot 2 becomes `supplier-primary`, the relay supplier becomes `supplier-backup`, Mehmet becomes `coordinator-duty`). Use the seed's names too.
- Replace the ids everywhere in `fixtures/` (users, `assignee`, `tried`, `requestedBy`, `reportedBy`, `actor`, `history.by` where it is an id).
- Fix every hardcoded default user id in pages and components (`grep -rn "zeynep\|team-4\|supplier-2\|supplier-4\|coord-1" app components fixtures`).
- Region names: use the seed's `malatya-merkez` where a field holds a region id. Keep human-readable addresses as they are.

Accept when: grep finds none of the old ids, `/agent?user=volunteer-callback`, `/field` and `/coordinator` all still show a task from the fixtures.

---
id: P-002
title: Contract v2.2: progress, assignee, posts, score parts, case numbers
author: role-3
reviewer: role-1
status: proposed
gaps: [G-05, G-06, G-07, G-08, G-09]
files:
  - lib/types.ts
  - lib/schemas.ts
  - components/field/FieldPhone.tsx
  - components/BoardCards.tsx
branch: p-002-contract
approved_by:
approved_sha:
---

# P-002: contract v2.2

## What and why

Five gaps need the contract to say something it does not say yet. This proposal adds those fields and nothing else.

- `ApprovalPayload.assignee` (G-05): Modify sends a different person. The keeper in P-003 applies it. Until P-003 merges, the field is accepted and ignored, so Modify stays unwired on `main`.
- `AnswerPayload.progress` and `Task.progress` (G-09, decision D7): "on our way" is `en_route`, "arrived" is `arrived`. The schema refuses `progress` unless `result` is `accepted`.
- `Site.posts` and `Post` (G-08, decision D3): the latest five posts behind a site, with `text` and `textEn` masked before storage. The card shows the three newest.
- `Site.supporters` (G-08): who has posted about the site. `support` is its length, so "4 posts from 1 person" counts people, not tweets.
- `scoreParts` on Site, Need and Task (G-06): the parts of a priority score, so the screen does not guess.
- `caseNo` on Site, Need and Incident (G-07): the number a person can say on the phone.

Every new field is optional, so existing documents and the routes that read them keep working.

The frontend changes are in this branch because they depend on the types. `FieldPhone` sends `progress` instead of the note workaround. `BoardCards` shows the posts.

## Contract change

`lib/types.ts`: header to 2.2. New: `ScorePart`, `Post`. Optional fields: `ApprovalPayload.assignee`, `AnswerPayload.progress`, `Site.posts`, `Site.supporters`, `Site.scoreParts`, `Site.caseNo`, `Need.scoreParts`, `Need.caseNo`, `Incident.caseNo`, `Task.progress`, `Task.scoreParts`.

`lib/schemas.ts`: `answerPayload` gets `progress` with a refine (only with `result: "accepted"`). `approvalPayload` gets `assignee` as an id.

Old shape to new: no field is removed or changed in type. A v2.1 event or document validates against v2.2.

## How to verify

```bash
npx tsc --noEmit                                       # exit 0
npx eslint components/field/FieldPhone.tsx components/BoardCards.tsx
```

Schema check, no database needed:

```bash
npx tsx -e 'import { eventBody } from "./lib/schemas.ts";
console.log(eventBody.safeParse({ type: "answer", source: "person", payload: { taskId: "t", result: "declined", progress: "arrived" } }).success);  // expect false
console.log(eventBody.safeParse({ type: "answer", source: "person", payload: { taskId: "t", result: "accepted", progress: "arrived" } }).success);  // expect true
console.log(eventBody.safeParse({ type: "approval", source: "person", payload: { taskId: "t", approved: true, assignee: "field-alpha" } }).success);  // expect true'
```

## Open questions

- Reviewer: should `Site.posts` be capped at 5 in the schema, or only by the keeper? This proposal caps in the keeper (P-003) and leaves the schema without a limit.
- Reviewer: `Post.actor` holds a user id or an agent name. Confirm that is acceptable for the board, which shows the text but not the actor.

## Reviewer notes


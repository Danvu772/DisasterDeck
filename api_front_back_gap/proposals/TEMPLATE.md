---
id: P-000
title: short title
author: role-1
reviewer: role-3
status: proposed
gaps: [G-00]
files:
  - app/api/board/
branch: fe/example
approved_by:
approved_sha:
---

# P-000: short title

Copy this file to `P-NNN-short-slug.md` with the next free number. Delete this line and fill every section.

Frontmatter rules: `author` is `role-1` or `role-3`. `reviewer` is always the other role. `status` is one of `proposed`, `changes-requested`, `approved`, `rejected`, `merged`. `gaps` lists ids from GAPS.md. `files` lists paths or folder prefixes this change touches. The author fills everything above the reviewer lines. The reviewer fills `approved_by` and `approved_sha` only, with the newest code commit they read. Any new code commit after approval voids it.

## What and why

One paragraph. Which gap this closes, what changes, and what the frontend or the API gets from it.

## Contract change

Write "none", or name the field in `lib/types.ts` or `lib/schemas.ts`, with the old and the new shape. Contract changes are announced before they land (Team contracts §2).

## How to verify

The exact command or request, and the result to expect. For an API change, that includes the `npm run api:check` result and any curl call against the route.

## Open questions

Anything the reviewer must decide. Write "none" if there are none.

## Reviewer notes

Written by the reviewer only: what was read, what was tested, and the decision.

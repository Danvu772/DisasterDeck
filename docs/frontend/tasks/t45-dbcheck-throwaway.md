---
id: t45-dbcheck-throwaway
effort: low
checkpoint: health
files: lib/db-check.ts
---
# db:check writes only to a throwaway desk (#31)

`npm run db:check` wrote a test site "address unknown" into the real desk `malatya-2023`, and it now shows on every screen. `api:check` and `keeper:check` already use throwaway desks and delete them afterwards (read `lib/keeper-check.ts` for the pattern, and decision D-03 in `api_front_back_gap/GAPS.md`). Do the same in `lib/db-check.ts`: a desk id like `check-db`, everything it writes goes there, and it deletes that desk's documents at the end, also after a failure (try/finally). Never write to `process.env.DESK_ID` or `malatya-2023`. Do not touch any other file. Do not remove the existing junk record (a person retracts it through the desk after the Brain restart).

Accept when: tsc passes, and reading the file shows no write can reach the real desk. Commit message mentions #31.

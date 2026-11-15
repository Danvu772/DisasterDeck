---
id: t61-feed-no-unknown-sites
effort: medium
files: workers/synthetic-feed.ts, (only if needed) the mock path of the tweet extractor it imports
---
# Synthetic feed must not write "address unknown" sites (#36)

The live desk `malatya-2023` has two sites named "address unknown" (site-6af9756f2755f32cc2f70b45, site-6af975f3a0b5018c11a8d43e). Every history entry is by `synthetic-feed`. In `workers/synthetic-feed.ts`, `xPass` calls `extractTweet(t, { mock: true })` and posts `x.report` even when the mock found no address.

Do:
1. Find why the mock extraction returns no address for those tweets (`data/tweets_replay.json`). Prefer fixing the mock so it yields the tweet's address. If a tweet truly has none, skip posting the report for it (log a line).
2. Add `npm run feed:retract-unknown` only if no existing script can do it, otherwise reuse: post a `correction` event with `action: "retract"` for every open site on `DESK_ID` whose address is "address unknown" and whose history is all `synthetic-feed`, via the same `postEvent` path the workers use, `actor: "coordinator-duty"`, `source: "person"`, reason "Synthetic feed wrote a report with no address (#36)". Refuse to run without `DESK_ID`. `--dry-run` prints and writes nothing.
3. Check against a throwaway desk (`DESK_ID=check-feed`): run the feed `--once` for every tweet, assert no "address unknown" site appears, then delete the `check-feed` documents. **Do not write to `malatya-2023`**. Run the retract script with `--dry-run` against `malatya-2023` and paste the plan in the report. The orchestrator runs it for real.
4. Don't restart the running feed or Brain (tmux `feed-synthetic`, `brain`). The orchestrator does that.

Accept when: tsc, eslint pass, the throwaway run has zero unknown sites, and the dry-run plan lists exactly the two sites above.

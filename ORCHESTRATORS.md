# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

None right now. Dan closed the session. Pick up from `PROGRESS.md` and the open PRs (#42 vision, #43 voice).

## History

- 18 Nov: photos-vision lane (#39 → PR #42) and voice-port lane (#14 → PR #43) both built and PR'd; session closed with both green and unmerged.
- 18 Nov: atlas-module (#8), aws-infra (#6), ci-mongo (#11), live-model-check (#23), feeds-directory (#10), uswds-coordinator (#17), uswds-map (#18) merged. Photos #36 (option 3) closed, superseded by D-0016 option 2.
# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

- **claude-orch-d0017**: Claude orchestrator, planners and builders via the Agent tool. lastTouch 2026-11-18. Owns D-0017 (inputs rebuilt on synthetic sources): #49 delete inputs, #50 origin + AP vetted, #51 demo player + desk clock, #52 sweeper on desk clock, #53 demo scenario, #54 screens (waits on #16, owned by claude-orch-1118b). Branch `claude/determined-gauss-3asma9`. Planning #49, #50, #51, #53 now; no code yet.
- **claude-orch-1118b**: Claude orchestrator, builders and evaluators on DeepSeek via `opencode run`. lastTouch 2026-11-18. Owns: #39 round 2 on `feat/39-vision-model` (`.worktrees/39`), #7 on `feat/7-aws-deploy` (`.worktrees/7`), #16 stacked on `feat/14-voice-port` (`.worktrees/16`). #43 evaluated: code green, VOX live halves wait on #7. Vision model id waits on Dan.

## History

- 18 Nov: D-0017 merged (#48): everything below the queue rebuilt on synthetic X, Instagram, Facebook and AP, one demo scenario. Issues #49 to #54 cut.
- 18 Nov: photos-vision lane (#39 → PR #42) and voice-port lane (#14 → PR #43) both built and PR'd; session closed with both green and unmerged.
- 18 Nov: atlas-module (#8), aws-infra (#6), ci-mongo (#11), live-model-check (#23), feeds-directory (#10), uswds-coordinator (#17), uswds-map (#18) merged. Photos #36 (option 3) closed, superseded by D-0016 option 2.
---
id: t44-ci
effort: medium
checkpoint: health
files: new .github/workflows/ci.yml, README.md (one badge line under the title only)
---
# CI: every push gets a green or red check

113 commits from four people and two coding agents tonight, zero CI. A broken push is only found when someone's screen breaks. Add one GitHub Actions workflow so every push and pull request to `main` shows a check on GitHub.

- `.github/workflows/ci.yml`, on push and pull_request to main. Ubuntu, Node 22, `npm ci` with npm cache. Steps: `npx tsc --noEmit`, `npx eslint`, `npm run check:tokens`, `npx next build`.
- No secrets in the workflow. The build must not need a database or keys: set `DEMO_MODE=1` and a dummy `AUTH_SECRET` as plain env in the workflow (say in a comment that it is a build-only placeholder, not a real secret). If `next build` needs anything else to pass without a database, find out and set the minimum.
- Concurrency group per branch, cancel in progress, so fast pushes do not queue.
- Target: under 4 minutes.
- Add a CI badge line right under the README title. Touch nothing else in the README (Role 4 just rewrote it, and the city in it is undecided, issue #32).
- Validate the YAML locally (for example `npx --yes @action-validator/cli .github/workflows/ci.yml`, or run the same four commands locally in order and confirm they pass).

Accept when: the four commands pass locally in the order the workflow runs them, and the YAML validates. The orchestrator pushes, then watches the first run with `gh run watch`.

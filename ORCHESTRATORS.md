# Orchestrators

Who is orchestrating what, right now. Every orchestrator session claims its lane here on start, touches its `lastTouch` heartbeat before and after each significant action, and strikes its lane on exit. A second orchestrator reads this before taking work, then corroborates against git (branches, PRs, open issues — `node scripts/orchestrators.mjs`).

Stale rules: a lane whose `lastTouch` is more than 4 hours old is dead. Confirm with Dan before claiming a dead lane's work.

## Live lanes

<!--
  Copy this block for each active lane. Keep `lastTouch` in ISO 8601 UTC.

  ### <short-slug-the-workstream>
  - Orchestrator session: <identifier, e.g. the tool + a word for the run>
  - Owning: <issues and their requirement IDs / design section>
  - Branch(es): <feat/…, fix/…, design/…, chore/…>
  - Repo: <Danvu772/DisasterDeck or another>
  - Started: <ISO UTC>
  - lastTouch: <ISO UTC>
  - Touch these files only: <path list>
-->

None right now.

## History

<!-- Lanes that are done get moved here with their closed issues, or just deleted. -->

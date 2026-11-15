---
id: t47-architecture-doc
effort: medium
checkpoint: judging
files: new docs/ARCHITECTURE.md
---
# docs/ARCHITECTURE.md for the CS Department track ("judges read your code, not your slides")

Write one architecture document a judge can read in five minutes and then find any piece in the code. Read the code, not only the other docs: `lib/` (types, db, auth, localDemo, rules), `workers/` (brain, memory-keeper, dispatcher, sweeper, scenario-player, the agents), `agents/personal/` (turn, tools incl. visualize_metric), `app/api/`, `components/` (board, map, metrics), `docs/frontend/` (README, DECISIONS, METRICS), `api_front_back_gap/`.

Sections: the problem in two sentences. The five boxes (inputs, research agents, Brain, collective memory, people with personal agents) as one ASCII diagram. One event's life from a post to a closed site, naming the exact file and function at each hop. The rules that keep it safe (one writer per collection, agents never talk to each other, the LLM reads and explains but rules allocate, approvals for risky work, demo identity only on localhost). How it is tested (keeper:check 23 cases, check:contract, security:check, e2e Playwright, CI). What is real and what is synthetic. Known limits, said plainly. A "where to look" table: question, file.

City-neutral wording (issue #32). Plain sentences, no hype words. Do not touch other files.

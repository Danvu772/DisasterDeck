---
id: t60-malatya-sweep
effort: medium
files: README.md, docs/devpost.md, docs/demo.md (and any other doc that names Antakya as the pilot city)
---
# One city: Malatya (#32)

Dan decided (#32): the story is **Malatya**. Commit `28ae61c` moved README.md, docs/devpost.md and docs/demo.md to an Antakya pilot. The app (header pill "Malatya exercise", fixtures, seed, live desk `malatya-2023`) says Malatya, and the recorded video uses Malatya.

Do:
1. `grep -rni antakya --include=*.md .` (skip node_modules). Rewrite every pilot/story mention to Malatya. Keep the facts true to what the app does: the live desk is `malatya-2023`, synthetic data, a Malatya exercise.
2. Drop the note in docs/devpost.md that says the video "uses Malatya and must be replaced". The video stays.
3. Also, Dan decided (#34) that the demo screens are **/v2** (`/v2`, `/v2/coordinator`, `/v2/field`, `/v2/volunteer`). Update docs/demo.md so the walkthrough opens the /v2 routes. Leave a TODO line only where a step uses a workflow /v2 doesn't have yet.
4. Don't touch code, fixtures or `scripts/check-antakya.mjs` (list it in your report so the orchestrator can decide).

Voice: plain, short declaratives. No em dashes, no semicolons, no hype words (leverage, showcase, seamless, robust).

Accept when: `grep -rni antakya --include=*.md . | grep -v node_modules` returns nothing about the pilot city, and the report lists every changed line range.

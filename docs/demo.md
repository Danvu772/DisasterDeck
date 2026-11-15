# Two-minute table demo

This is a retrospective Türkiye 2023 exercise. Tweets, people, callbacks, shelter counts and scripted field/supplier observations are synthetic. Scripted observations use the current exercise clock for freshness and task timing. NASA data is presented with its historical product dates. Use the run that passed the live integration checklist below.

## Proposed people and devices

| Team operator | App session / device | Responsibility |
|---|---|---|
| Role 4, presenter | Shared board and NASA card on the presentation laptop, scenario terminal on a second screen | Narration and manual fallback cues |
| Role 2 | Volunteer Zeynep (`volunteer-callback`), laptop A | Callback confirmation |
| Role 3 | Field Team A (`field-alpha`), phone over HTTPS | Accept dispatch and request 20 blankets |
| Role 1 | Coordinator (`coordinator-duty`), laptop B. Primary and backup supplier sessions on two prepared tabs/profiles | Approve field dispatch, accept delivery and enter ETA, accept replacement if CP4 passed |

The team should confirm these operator assignments and devices before rehearsal. Ayşe is the person reported trapped. Zeynep makes the simulated callback. Prepare each role session before the timer starts.

## Live run

| Time | Narration and action | Acceptance evidence |
|---|---|---|
| 0:00–0:20 | Presenter opens. “During an emergency, four posts can describe one person while teams repeat the same calls. This is a historical Türkiye scenario with synthetic reports.” Start the five-post replay. | Four related posts converge on Turuncu Avlu. Mor Avlu stays separate. |
| 0:20–0:40 | Zeynep accepts and confirms the simulated callback. The coordinator approves the high-risk dispatch. The field operator accepts. | Verified site, one callback owner, a visible human approval and accepted field task. |
| 0:40–1:05 | Field operator sends “Turuncu Avlu için 20 battaniye gerekiyor.” Supplier A accepts the resulting task and gives a 15-minute ETA. Presenter says “The request and ETA reach the same shared case.” | One blanket need, one delivery owner, field inbox showing the ETA. |
| 1:05–1:25 | If CP4 passed, Supplier A presses Problem or the presenter triggers `truck-breakdown`. The supplier operator accepts the replacement as Supplier B and gives a revised ETA. | Original delivery blocked, existing need reopened, replacement linked with `replaces`, updated ETA and coordinator incident card. |
| 1:25–1:45 | Presenter opens the dated NASA evidence card. “NASA POWER records a regional minimum of minus 14.38 Celsius on February ninth. We keep the satellite measurements unknown where these images cannot support them.” Show the warmth-priority effect if it passed live acceptance. | Source, place, date, scale and the actual cold alert. A demonstrated +20 warmth-priority change when available. |
| 1:45–2:00 | Presenter points to the next action and owner. If CP4 passed, close on Supplier B's accepted replacement and the field team's revised ETA. Otherwise close on Supplier A's accepted delivery. | A visible next owner and a committed ETA. |

Use the successful CP3 ending when the breakdown flow has not passed. Shelter and road cues are available for a longer explanation or questions. Keep the table run focused on the callback, approved field response and delivery handoff.

## Presenter cues

### Spoken pitch for the verified build

**0:00–0:30 · Open the comparison screen.** “You’re on the volunteer desk. Four messages say Ayşe is trapped. Before you pick up the phone, you need to know whether somebody has already called. These are synthetic reports in a Malatya earthquake exercise. Look at the right-hand side. Zeynep has the Turuncu Avlu callback. At Mor Avlu, two people are reported trapped and nobody owns the call yet.”

**0:30–1:00 · Open the coordinator screen and expand the history.** “Here’s the decision that stays with a person. The coordinator sees who requested a dispatch and can approve, change or reject it. In this separate demo case, a delivery truck has a flat tire. The problem card shows the blocked delivery and the proposed handoff. Our live rehearsal has to prove that the updated ETA reaches the field team.”

**1:00–1:40 · Show the archived evidence and worker output.** “Why blankets? NASA POWER recorded a regional minimum of minus 14.38 Celsius on February ninth. The weather grid is about 50 kilometres across, so these two sites share the same measurement. Our worker generates one cold alert per site. The radar map is about 30 metres per pixel. The night lights are about 500 metres, and the image saturates here. We leave a silent zone unresolved rather than sending a team on that evidence.”

**1:40–2:00 · Return to the unclaimed site.** “If you take the next volunteer shift, your first question has an answer. Zeynep owns the first call. This second address still needs someone. That’s the handoff we want the desk to make visible, from the callback all the way to the field team’s delivery time.”

The [narrated video and gallery images](submission.md) cover this version. Once live acceptance passes, use the operator sequence above.

Choose a run name after the team's clean reset and use it for every cue. Check the preview before sending a fallback.

```sh
node --env-file=.env.local workers/scenario-player.ts --run table-01 --step truck-breakdown --dry-run
node --env-file=.env.local workers/scenario-player.ts --run table-01 --step truck-breakdown
```

Use `blankets` if the field role is unattended. It waits for the approved field task to be accepted and observes an already-recorded live request. Use `truck-repaired` after the scripted tire replacement has been confirmed. That cue resolves the same incident and can be exercised after the two-minute table run.

The full command and checkpoint behavior is in [the player runbook](scenario-player.md). Data interpretation is in [the NASA evidence card](nasa-evidence.md).

## Rehearsal acceptance

- [ ] Role 1 loads the seed and supplies working board/events endpoints with worker authentication.
- [ ] Confirm the synthetic exercise clock and refresh any shelter-capacity observations used in the live story.
- [ ] Five replay posts produce two sites. Replaying a source ID leaves source and task counts stable.
- [ ] Zeynep completes the callback, a coordinator approves field dispatch and Field Team A accepts.
- [ ] The live field request creates one 20-blanket need. Supplier A accepts and the field team sees the ETA.
- [ ] One real Exa lookup is visible in the product before the presenter mentions it.
- [ ] Confirm track entry and AI-tool attribution. The current agent implementation uses Claude and Claude web search, while the written Future of Intelligence plan specifies OpenAI and Exa. Resolve that difference before entering the track or naming those integrations in the pitch.
- [ ] A NASA cold event is consumed by the actual Brain. The same-tier warmth priority change is verified with other terms fixed.
- [ ] CP4 extension passes with the primary delivery blocked, Supplier B's replacement, revised ETA and coordinator incident.
- [ ] `truck-repaired` updates the existing incident. Repeating each cue leaves one effect.
- [ ] Four people complete three timed rehearsals with the team's reset between runs.
- [ ] Save the successful screen sequence and record the video under three minutes.

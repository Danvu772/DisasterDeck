# Completing the live Disaster Desk pipeline

Reviewed on 15 November 2026 against main revision **f235d43**, including the contract, metrics and agent-feed changes merged during this review. This plan comes from source inspection and the local checks listed below. Atlas connectivity, deployed role sessions and the complete live workflow still need an integration run.

The working core is report ingestion, MongoDB event storage, report-to-site processing and board reads. The next deliverable is a live callback, approved field dispatch and accepted blanket delivery with an ETA visible to the requesting field team.

| Area | Evidence in this revision | Remaining work |
|---|---|---|
| Event transport | Typed payloads, authentication and deduplication in [events route](../app/api/events/route.ts), [schemas](../lib/schemas.ts) and [database helpers](../lib/db.ts) | Apply accepted events to records and work. An HTTP 200 acknowledges queue insertion. |
| Brain | Lease, retries, heartbeat and cache-version bumps in [brain.ts](../workers/brain.ts) | Complete dispatch before final event acknowledgement and reconcile interrupted effects. |
| Memory keeper | [HANDLED](../workers/memory-keeper.ts) contains only report | Add handlers for answer, approval, need, closure, capacity, alert, incident, claim and correction as their workflows land. Plan events belong to the later evacuation scope. |
| Task assignment | [dispatcher.ts](../workers/dispatcher.ts) has an empty react function | Create and update tasks and inboxes using the shared state model. |
| Timers | [sweeper.ts](../workers/sweeper.ts) retries stuck events | Add task deadlines, reassignment, ETA check-ins and stale-capacity follow-up. |
| Read APIs | Board, health and event feed routes exist under [app/api](../app/api/README.md) | Add user-scoped inbox reads/mark-read and the permitted people list. |
| Agents | Research workers, personal-agent tools, chat memory and versioned board caching exist under [agents](../agents/TODO.md) | Exercise the tools against real tasks and consume their results through the completed Brain. |
| Screens and contract | Original routes and [v2 screens](../components/v2/boardModel.ts) read board data. Contract v2.2 adds assignee, progress, posts, score parts and case numbers | Populate and apply the accepted fields in the Brain. Verify live state independently of fixture previews. |
| NASA and replay | [Scenario player](scenario-player.md), [NASA evidence](nasa-evidence.md) and [satellite atlas](nasa-atlas.md) are available | Consume cold events in the Brain and demonstrate a real priority consequence. |
| Metrics | [Engine](../components/metrics/registry.ts), [router](../components/metrics/router.ts), charts and [definitions](frontend/METRICS.md) exist | Connect metrics to live chat/screens and their actual inputs. Two evaluation metrics also require scenario ground truth. |

A live demonstration should follow this sequence.

~~~mermaid
flowchart TD
    A[Replay or real person] --> B[Agent or event API]
    B --> C[MongoDB events]
    C --> D[Brain lease and event claim]
    D --> E[Memory keeper updates records]
    E --> F[Dispatcher updates tasks and inboxes]
    F --> G[Final event result and desk version]
    G --> H[Board, role screen and personal agent]
    H --> I[Human answer or approval]
    I --> B
    J[Sweeper deadlines and check-ins] --> D
~~~

The next steps follow the existing ownership model. Role 1 owns the Brain, database and API contract. Role 2 owns agents. Role 3 owns screens. Role 4 owns replay, NASA, scenarios and presentation evidence. Cross-owner changes should use the team's existing review process. [Team contracts](Multiplayer%20Disaster%20Desk/Roles/Team%20contracts.md) · [API coordination](../api_front_back_gap/README.md)

1. **Make one event complete reliably. Role 1.**

   In workers/brain.ts, processEvent currently stores the final event status before dispatcher.react runs. A process exit between those operations leaves a completed event with missing work. A retry of an already-merged report can also return an empty changes list, so moving the final status write alone will not repair every interrupted dispatch.

   Keep the event recoverable until its record and work effects are durable. Choose an Atlas transaction or a durable, idempotent reconciliation mechanism. Derive task/inbox effect identities from stable event, record, recipient and action identifiers. Preserve the existing one-open-task index. Replaying an effect must converge on the same task and notification.

   Pass enough validated event/result context to the dispatcher for task-only answers and approvals. A changed-record array alone does not describe those operations. Keep record writes in the keeper and task/inbox writes in the dispatcher. Retain desk-version invalidation after changed records or work so personal-agent caches refresh.

   **Accept when** terminating the Brain after the record write, after task creation and before acknowledgement produces one eventual task and one notification per intended effect. Replaying an already-completed event preserves counts. An existing completed report can be reconciled after the dispatcher is introduced. Long operations retain valid lease ownership.

2. **Finish the smallest human loop. Roles 1, 2 and 3.**

   Extend the dispatcher to offer one call task to an eligible, available volunteer for an actionable unverified site. Use existing role, region, coordinates, status and profile data. Record the assignment reason. An incomplete-location report needs a clarification path before field dispatch.

   Handle answer events for acceptance, decline and completion. Agree a machine-readable callback outcome between the contract and personal-agent tools. Completion alone does not establish verification. A verified callback, an unanswered phone, an incorrect address and an already-rescued report need distinct state transitions. Preserve existing clients that send accepted/declined/done and an optional note.

   After a trusted callback verifies the site, create one high-risk rescue task in waiting_approval and an approval inbox item for a coordinator. An approved task becomes assigned. A rejected task retains an auditable reason. Contract v2.2 already accepts ApprovalPayload.assignee. Apply that value in the dispatcher, validate the replacement person's eligibility and wire the remaining Modify controls to the implemented behavior.

   The field operator can then accept, report en_route and report arrived. AnswerPayload.progress already survives validation when result is accepted; apply it to Task.progress and update the relevant site to team_on_site on arrival. Existing clients without progress keep their current behavior. Review both [original approval controls](../components/coordinator/ApprovalCard.tsx) and [v2 coordinator controls](../components/v2/CoordinatorV2.tsx).

   **Accept when** Zeynep receives an actual call task, the callback changes the real site, a coordinator approves the actual rescue task, and Field Team A sees and accepts it. Repeating an answer or approval leaves one transition. A public repost cannot independently confirm a site or close a rescue case.

3. **Complete the blanket request and ETA. Roles 1 and 2, with Role 3 verifying both role screens.**

   Add the need handler in the keeper and deliver-task rules in the dispatcher. Preserve site links, requestedBy, quantity, lifeThreatening, confidence, tier and history. Define repeated-report merging without multiplying a single request's quantity. Keep separate recipients and requested quantities in need lines.

   Choose the supplier using available status, region, coordinates, vehicle, stock and prior declines. Record reservation/commit/release behavior so retries and replacement deliveries cannot promise the same stock twice. Define whether quantity represents the total or remaining obligation, and retain requested/delivered quantities for accounting and metrics. Accepted delivery writes an ETA, marks the task accepted and updates the need to on_the_way. Send the ETA to every relevant requester through persistent inbox items. Completion records the fulfilled quantity and moves the need to delivered only when its obligation is met.

   The requesting field person files needs through the personal agent. POST /api/events deliberately refuses a direct need from a person. Keep the normal /api/chat tool route working. The scenario player's blankets cue is a trusted-worker fallback and waits for an accepted high-risk field task.

   **Accept when** a real 20-blanket request creates one need and one active delivery, Supplier A accepts with an ETA, and the requesting field phone sees that ETA after refreshing and reopening the session. A duplicate request or retry does not double quantity, tasks or stock commitments.

4. **Connect NASA, roads and capacity to decisions. Roles 1 and 4; Role 2 verifies Sheets ingestion.**

   Implement closure, capacity and alert handlers with stable target identities and observation times. Reject or retain as historical evidence an older capacity observation that would otherwise replace a newer count. Preserve uncertainty on unconfirmed roads. The sheet worker already produces events, but capacity events cannot update shelters until this handler exists.

   For NASA cold alerts, map zoneId to the seed/configured area and affected warmth needs. The existing score helper already supports warmthInCold (+20) and silentZone (+30); current report processing supplies neither. Recompute affected record/task priorities consistently while preserving tier precedence.

   The current database Zone type requires numeric damage and boolean dark/silentZone, while the evidence GeoJSON permits missing values. Have Role 1 choose an explicit representation for unmeasured fields or separate cold observations. Filling missing damage or darkness with zero/false would erase uncertainty. The NASA watcher currently emits two cold alerts and no silent-zone alerts.

   **Accept when** holding support, waiting time and tier fixed makes the same warmth need gain exactly the documented cold term once. Repeating the alert preserves that result. A newer shelter count reaches the board and agent, an older count cannot replace it, and a closure reaches the relevant role. Source acquisition dates remain visible.

5. **Implement the breakdown and timer extension. Role 1, with Roles 2–4 exercising it.**

   In the keeper, incident creates or updates the actual incident, its links, severity and history. In the dispatcher, a breakdown with canContinue=false blocks the original task and creates one replacement linked by replaces. Set the original task's open state consistently with the unique open-task index. Preserve the original need and quantity obligation. Inform the original assignee, the replacement supplier, requesters and coordinator.

   An incident update with incidentId and resolved=true updates that incident. Repair must not revive a delivery already being performed by its replacement. Handle partial supply and coordinator escalation using the same accounting. Review claim events for declared work and authorized corrections so they cannot create duplicate assignments or bypass high-risk approval.

   Extend the sweeper using the documented deadlines. Expired unanswered tasks select the next eligible person and update tried. An expired ETA creates an auditable check-in. Repeated timer turns create one effect. Keep event crash recovery and lease behavior intact. [System design](Multiplayer%20Disaster%20Desk/Final%20system%20design.md)

   **Accept when** Supplier A's accepted delivery becomes blocked, Supplier B gets the replacement, the field phone sees the revised ETA, and repair resolves the original incident without creating two active deliveries. If this extension is incomplete at rehearsal, the accepted primary-delivery ending remains the available presentation.

6. **Finish API and screen integration in parallel. Roles 1 and 3.**

   | Boundary | Concrete work and acceptance |
   |---|---|
   | Inbox | Add GET /api/inbox and an explicit mark-read operation. Bind requests to the authenticated/demo caller and permitted recipients. Test persistence and unread-count clearing. |
   | People | Add GET /api/users with the agreed caller roles and minimum fields. Coordinates are needed if the coverage metric is selected. Avoid exposing profile notes through the people picker. |
   | Contract | Assignee, progress, posts, score parts and caseNo are on main through P-002. Implement their producers and effects. Agree callback outcomes, update OpenAPI and clients for any further contract change, and allocate short numbers atomically. |
   | Desk selector | Scenario-player GET requests use deskId, while the board route reads desk. Agree the canonical parameter and handle existing callers. A nondefault-desk test must return only that desk. |
   | Event feed | [t35](frontend/tasks/t35-api-integration.md) has landed. Its timestamp cursor receives inserted events, while Brain changes status/result without changing ts. Refresh a recent window or provide an update-aware cursor so existing rows show pending → done/merged. Preserve ID/dedupe reconciliation and report-detail links. Test equal-timestamp pagination as well. |
   | Role identity | Use seeded database IDs in role sessions. lib-desk currently falls back to fixture users, and boardModel uses fixture display names. Acceptance needs the same actual user and task IDs across UI, chat and database. |
   | Task links | Enforce actor, task and record desk consistency. Test an unknown task, a different assignee and a cross-desk target. |
   | Preview mode | /v2?demo=1 returns fixture state. The v2 board also has its own map implementation. Verify the selected presentation route against live data and decide how it links to /map's NASA evidence. |
   | Sign-in and phone | Verify the actual SSOJet callback, user map and role permissions. Run speech recognition and geolocation on a real HTTPS phone session. Demo-mode results do not establish SSO success. |

   **Accept when** each role can reload its page and retain the server's task state, history, ETA and unread messages. The same task IDs are used in chat, role buttons, event results and the board. Missing API credentials and failures produce actionable feedback. A fixture fallback remains visibly labeled.

7. **Make the scenario reproducible, then collect acceptance evidence. All roles.**

   The committed shelter/user dates are historical. Choose and document one exercise clock for synthetic events, availability, lastSeen, deadlines and displayed ages. Refresh synthetic seed observations as part of rehearsal setup while retaining NASA's real acquisition dates.

   The replay's first four messages paraphrase one original call. The keeper currently identifies social voices by normalized text; differently worded copies can inflate support. The provenance mapping in the NASA preparation script does not reach ReportPayload or the keeper. Agree a source/original-call identifier across the replay worker, schema and support calculation, retaining text-based fallback for existing events. Keep post count, original calls and independently corroborating voices distinguishable.

   The --mock extractor is a transport smoke test. Check Turkish spelled-out counts and addresses in the actual five-post replay before using it as end-to-end evidence. The recorded scenario truth is one person at Turuncu Avlu and two at Mor Avlu.

   Prepare a scoped reset/replay procedure. seed.ts replaces users and shelters but leaves events, sites, needs, tasks and incidents. A different scenario run name only changes player event keys. X keys are x:<tweet id> under a globally unique dedupe index, so a different desk alone does not isolate another replay. Namespace fresh fixture IDs/keys consistently or review a compatible dedupe migration. Preserve keys when testing retry behavior.

   | Rehearsal checkpoint | Required observation |
   |---|---|
   | Report ingestion | Five posts yield two sites; Turuncu retains four source posts and the expected person count. Replaying the same ID preserves counts. |
   | Callback and dispatch | Actual volunteer callback, site verification, human approval and field acceptance appear in persistent history. |
   | Delivery | One 20-blanket need, supplier acceptance and an ETA visible on the requesting field phone. |
   | NASA | An actual cold event changes the documented same-tier warmth priority once, with a dated source shown. |
   | Optional breakdown | One blocked primary delivery, one accepted replacement, revised ETA and resolved incident. |
   | Recovery | Restart after a partial write and repeat a cue. Task, inbox and stock effects remain consistent. |
   | Evidence | Save commit, run ID, real record/task/event IDs, screenshots and test results. Complete three timed four-person runs for the selected ending. |

The existing proposal branches contain reusable work. Local remote-tracking refs inspected during this review were p-001-read-routes at 2570d0b, p-002-contract at 52db9f4 and p-003-keeper at 327a64a. P-002 was merged into main by f235d43, although its proposal metadata still says proposed. Fetch and inspect current branch/merge state before applying another patch. Main has its own Brain, cache invalidation, board, health and feed implementations, so reconcile overlapping changes individually.

| Candidate | Useful material to inspect | Reconciliation needed |
|---|---|---|
| P-001 | Inbox/users reads and their OpenAPI entries | Board/health/feed already exist on main. Existing approval records refer to older SHAs. |
| P-002 | Contract fields and corresponding controls, already merged | Complete the Brain producers/effects and correct the stale proposal status. Preserve existing serialized events. |
| P-003 | Assignment rules, event handlers and pure tests | Different keeper/loop design. Its proposal describes claim/correction/plan as completed without effects; unsupported operations must have an explicit observable outcome. Recheck crash recovery, stock accounting and writer ownership. |

The issue overview and gap register help locate ownership discussions. Several narrative paragraphs in the gap documents predate the working board/health/feed routes and Brain. Use the source snapshot table above when deciding what remains. [Issue overview #26](https://github.com/DarshalShetty/HackTheNest26/issues/26) · [Gap register](../api_front_back_gap/GAPS.md) · [Existing handoff](../api_front_back_gap/HANDOFF.md)

Run the core acceptance before spending the remaining build window on optional features. The metrics engine and charts are now implemented against MetricResult. Finish live chat integration and supply the required users, event histories and scenario time. Keep agent_fidelity and triage_order unavailable until scenario ground truth and an evaluation method exist. Aftershock push needs a quake event contract and inbox routing; the current worker supplies warnings to subsequent agent turns. Prithvi inference, building-level damage classification, automatic live satellite ingestion, evacuation and additional social platforms remain later extensions. [Metrics](frontend/METRICS.md) · [Agent backlog](../agents/TODO.md) · [NASA atlas](nasa-atlas.md)

For a local or team integration run, the server and workers need the same current MONGODB_URI, MONGODB_DB, DESK_ID and AGENT_KEY. Real agent turns additionally require ANTHROPIC_API_KEY. Demo sessions use DEMO_MODE=1 and a local AUTH_SECRET; a real login uses the SSOJet settings in .env.example. Keep actual values in the local environment. On Windows, node and the package-manager commands must resolve in each terminal.

~~~sh
# One-time team setup, after the environment has been completed.
npm install
npm run db:check
npm run db:seed

# Separate long-running terminals.
npm run dev -- --hostname 127.0.0.1 --port 3672
npm run brain

# Another terminal. Mock mode checks transport; remove --mock for Claude extraction.
npx tsx --env-file=.env.local workers/x-agent.ts --mock --speed 1
~~~

Only one Brain processes the shared database at a time; the existing lease makes another instance wait. Confirm the seed step with the database owner because it replaces existing users and shelter snapshots. The app that is already running must be restarted to pick up a newly created environment file.

Open /api/health and verify an advancing lastLoopAt, then /api/board and the event feed. A heartbeat shows that the loop is alive; event results and resulting records establish that a workflow completed. Run the role pages without ?demo=1 for live acceptance. Set BASE_URL=http://127.0.0.1:3672 for the HTTP workers and contract check. Use the preview before each presenter cue. Currently, non-report event types stay pending until the handlers above are implemented.

~~~sh
npm run api:check
npm run keeper:check
npm run check:contract
node --env-file=.env.local workers/satellite-watcher.ts --dry-run
node --env-file=.env.local workers/scenario-player.ts --run integration-01 --step blankets --dry-run
~~~

api:check and keeper:check exercise MongoDB and use throwaway desks with cleanup. check:contract calls the running server, uses nonexistent task IDs for payload checks and can invoke a real chat turn. Collect their results against the configured environment. The local HTTP harnesses for the NASA/scenario workers verify payloads, retries and journals; they do not exercise the real dispatcher.

Local checks completed for this document were TypeScript checking and the replay/seed validator. Shared Atlas tests, live Claude calls, SSOJet login, task dispatch and four-person acceptance were not executed in this review. Retain that distinction in Devpost and the recorded demo.

Finally, update the [presentation checklist](submission.md) from the run that passed. Verify teammate membership, selected sponsor integrations, NASA attribution, judge-accessible repository/video links and final submission confirmation. The runtime uses Claude and Claude web search; the written OpenAI/Exa track plan needs a team decision based on the integrations actually demonstrated.

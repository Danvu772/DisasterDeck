# D-0011 Evacuation planner: deferred

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
The v2 design had a flow planner that splits evacuation traffic by road capacity. It was never built. The keeper already accepts a `plan` event and a coordinator can approve it, but nothing produces one. Each pilot area needs its own road graph.

## Decision
Defer. A campus tabletop needs no road routing. Keep the `plan` event type and the approval path so a planner can be added without a design change.

## Consequences
No road-graph work. The `evacuate` task type stays, only reachable when a coordinator creates the plan by hand.

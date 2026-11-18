# D-0012 Photo agent: deferred

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
v2 planned an agent that reads shelter whiteboard photos (the Lahaina failure). It was never built.

## Decision
Defer until a pilot runs shelters. Shelter counts come from the shelter's own agent, the sheet sync, or a coordinator.

## Consequences
No vision model in the pilot. `capacity` events keep their `observedAt`, so a photo agent can be added later.

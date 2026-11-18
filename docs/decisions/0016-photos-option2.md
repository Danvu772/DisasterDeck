# D-0016 Photos: a vision model describes them into text

- **Date:** 2026-11-18
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
D-0003 moved every model call to gpt-oss on OpenRouter. gpt-oss reads text only, so after #21 a photo sent to an agent through `/api/chat` never reaches a model: the agent gets a text note and asks the person to describe what it shows. D-0003 flagged this as issue #22. D-0012 has deferred only the shelter-whiteboard photo agent, not every photo, so a field team reporting a damaged building or an injury with a photo lost the fast path.

Dan's first call was option 3 (attach the photo to the record, no model reads it). On final review he chose **option 2**: photos should work again immediately, so a photo must reach a model that can read it.

## Decision
Add one open-weight vision model on OpenRouter's US endpoint, used **only** to describe a photo into text. It sits behind the same LLM port as everything else (`modelFor()` / `send()` in `agents/shared/llm.ts`) and becomes a new `vision` purpose next to `chat` / `extract` / `summary` / `digest`. The text description is what the agent acts on and what gets filed; the model never files an event directly from image bytes.

The photo still attaches to the event (`photoUrl`), but now a coordinator reads the record AND the agent has a text description of what the photo shows. The attach-only path is kept, not thrown away — the description rides alongside the attachment.

## Consequences
- A second model to vet and price. The spend meter already records OpenRouter's `usage.cost` per call, so the budget follows the real price. The vision model must have a confirmed US-region provider under the Business plan's in-region routing (same fail-closed rule as D-0003).
- New env override `OPENROUTER_MODEL_VISION` (and `OPENROUTER_EFFORT_VISION`), mirroring the existing per-purpose overrides. `modelInfo()` in `/api/health` gains a `vision` entry.
- `photoUrl` on `report`, `incident` and `capacity` events stays (a data URL for the pilot, `https` once S3 lands); the vision call turns the bytes into a text description the prompt already knows how to use.
- Invariant 3 still holds: the model describes, it does not allocate.
- Supersedes D-0012's "no vision model in the pilot" consequence; D-0012's shelter-whiteboard deferral stays as a scoped subset (the general photo path is reactivated, the dedicated whiteboard agent is not rebuilt).

# D-0016 Photos: attach to the event, no model reads them

- **Date:** 2026-11-18
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
D-0003 moved every model call to gpt-oss-120b on OpenRouter. gpt-oss reads text only. A person can still send a photo to their agent through `/api/chat` (a damaged building, a shelter whiteboard, an injury), but after #21 the model never sees the image bytes: it gets a text note and asks the person to describe what it shows. D-0003 did not account for this, and D-0012 deferred only the shelter-whiteboard photo agent, not every photo.

## Decision
Photos attach to the event record and a coordinator looks at them. No model reads image bytes for the pilot. The photo is stored on the event's `photoUrl` and rendered on the event card for a coordinator; the agent sees only the text note that a photo arrived. A vision model (option 2) can come later, when a real pilot starts.

## Consequences
- The pilot keeps one model (gpt-oss-120b). No new model to vet or price.
- Nothing is extracted from the photo automatically; a coordinator reads it by hand.
- Storage is a data URL on the event for now (simplest thing that works before #6/#7 deploy S3). When S3 lands, `photoUrl` becomes a real URL and the schema already accepts `https`.
- `report`, `incident` and `capacity` events carry the photo; the model still files nothing from image bytes.
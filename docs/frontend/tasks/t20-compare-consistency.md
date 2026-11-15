---
id: t20-compare-consistency
effort: low
checkpoint: pitch
files: components/compare/adapt.ts
---
# /compare must not contradict itself

On the right half of `/compare`:
1. Turuncu Avlu says "Owner: Zeynep is calling" but its card says "Call status: not called". When an owner is calling, the site's `callStatus` must be `called`.
2. Mor Avlu shows "Confirmed" next to "Automated, not yet seen by a person." A site that only came from X with no person in its history is `unconfirmed`.

Fix the data in `adapt.ts` so the card, the owner line and the confidence agree. Do not change `SiteCards`.

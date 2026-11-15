---
id: t03-site-card-truth
effort: low
checkpoint: CP1
files: components/BoardCards.tsx (SiteCards only)
---
# Site cards say how many people reported and whether a person has looked

Two small additions to `SiteCards` in `components/BoardCards.tsx`. They answer judge questions ("isn't this afetharita?", "how do you stop misinformation?").

1. Under the detail line: "4 posts from 1 person" style text, from `site.sources.length` (posts) and `site.support` (different people). If both are 1, write nothing.
2. When no entry in `site.history` has `source: "person"`, add the muted line "Automated, not yet seen by a person." (Watch Duty does this.)

Plain text, muted, sentence case, no new colours. Do not touch the other card renderers.

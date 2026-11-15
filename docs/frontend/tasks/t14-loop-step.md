---
id: t14-loop-step
effort: medium
checkpoint: polish
files: components/BoardCards.tsx (SiteCards only), components/BoardTabs.tsx, new components/loopStep.ts
---
# Where each site is in the loop

The research's main point: everyone else stops at "here is a pin". The desk closes the loop. Show it on every site card as one line of text (the visual language bans progress dots).

Steps: 1 Reported, 2 Called back, 3 Team approved, 4 Team on site, 5 Reported back (closed).
- Derive the step in a pure function `loopStep(site, tasks)` in `components/loopStep.ts`: `callStatus` verified means at least 2, an approved or accepted rescue task for the site means 3, `status: "team_on_site"` means 4, `status: "closed"` means 5.
- `SiteCards` gets an optional `tasks` prop. With tasks, show "Step 3 of 5: team approved." in muted text. Without, derive from the site alone.
- Pass `tasks` where `SiteCards` is used with a board at hand (`BoardTabs`). Do not touch other renderers.

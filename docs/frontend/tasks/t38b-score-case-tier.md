---
id: t38b-score-case-tier
effort: medium
checkpoint: role1-takeover
files: components/RecordCard.tsx, components/BoardCards.tsx, components/board/*, components/detail/*, components/field/FieldPhone.tsx (the task title line only), new components/ScoreBreakdown.tsx
---
# Why it ranks here, case numbers, tier in words (closes #4, #5)

New on main (t37): records carry `scoreParts` (they add up to `priority`) and `caseNo` (Site, need, incident). Fixtures may lack both, so everything below must render cleanly without them.

1. **Priority breakdown (#4, frontend t04):** wherever a card or board row shows "Priority 54", make it a button that opens a small popover (`components/ScoreBreakdown.tsx`): one line per part ("Different reporters, 4 x 10, 40", "Minutes waiting, 14", "Cold night, 20"), the total in mono, and the rule in one muted sentence: "Tier first, then this score. A coordinator can override it." Without `scoreParts`, the number stays plain text. Escape and a click outside close it.
2. **Case numbers (#5, frontend t13):** show `caseNo` as "Site 57", "Need 12", "Problem 3" before the title on cards, board rows, the detail panel heading and the field phone's task title. Mono for the number. Without `caseNo`, show nothing extra.
3. **Tier in words on every card (from the CSS review):** the tier is told only by the bar colour today, and the gold and grey bars fail WCAG 1.4.11 (1.66:1 and 2.24:1 on white). Add the tier in text next to the priority: `tierText(tier)` from `encode.ts` gives "T1" (mono) and "Urgent". Keep the bars.

Accept when: tsc, eslint and check:tokens pass, and `/lab` still renders every card kind. Commit with `Closes #4, closes #5`.

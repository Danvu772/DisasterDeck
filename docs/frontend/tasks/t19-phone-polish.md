---
id: t19-phone-polish
effort: medium
checkpoint: CP3
files: components/map/DeskMapView.tsx, components/field/FieldPhone.tsx
---
# Map legend and field copy on a phone

Seen at 390 px wide:

1. **`/map`:** the legend covers the whole map. Below the `md` breakpoint, collapse it behind a small "Legend" button (outline style from `encode.ts`) in the same corner. Tapping it opens the legend, a "Close" button closes it. At `md` and up it stays open as now.
2. **`/field`:** the header says "Signed in as field-alpha" when nobody signed in. In demo mode (`?user=` or the default) say "Acting as field-alpha (demo)", the same words `/coordinator` uses. Only say "Signed in as" when there is a real session (the `Account` component in `components/Account.tsx` shows how to read it, or leave the session case out and say so in your report).

---
id: t11-today-vs-desk
effort: medium
checkpoint: pitch
files: new app/compare/page.tsx, new components/compare/*
---
# "Today vs. with the desk", for the pitch opening

One screen, two halves, the same five tweets on both sides (`data/tweets_replay.json`, read it at build time).

- **Left, "Today (Malatya, 2023)":** what volunteers actually had. A plain spreadsheet-looking table, one row per tweet, columns Time, Text (English, original below in muted), Address, Called?, Who is on it? The last two columns are empty. Duplicate tweets about the same address show as separate rows.
- **Right, "With the desk":** the same tweets after the desk. Merged into sites (use `SiteCards` from `components/BoardCards.tsx` with the fixture sites from `makeBoard`), showing "4 posts from 1 person", owner and age.
- Under both, one sentence each, no hype. Left: "Five posts, four rows about one building, nobody knows who called." Right: "One site, four posts counted, a volunteer is calling."
- Fits a 1280 by 720 projector without scrolling. No nav changes.

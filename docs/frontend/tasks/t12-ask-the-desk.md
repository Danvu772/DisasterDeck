---
id: t12-ask-the-desk
effort: medium
checkpoint: polish
files: components/LiveBoard.tsx, new components/AskDesk.tsx
---
# Ask the desk, on the board

`Final system design.md` §7 calls it "Ask the desk": a read-only question box. Every answer names its source and age ("Shelter B 40 of 120, sheet, 6 minutes ago"). It is the same `ask_desk` tool every personal agent has.

- A one-line box above the board tabs in `LiveBoard`: "Ask the desk", a text input and an Ask button (primary).
- It posts `{ text }` to `POST /api/chat?user=<id>` (read `app/api/chat/route.ts` for the body and reply shape). The asker is `?user=` from the page URL, else `coordinator-duty`.
- Show the answer under the box as "**Agent:** ..." (same as `ChatLine`). One answer at a time, the newest replaces the last. Show errors in plain words. While waiting: "Asking".
- If `/api/chat` is not reachable, say "The desk agent is not answering" and keep the box usable.

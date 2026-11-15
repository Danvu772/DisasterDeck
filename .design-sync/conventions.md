# Disaster Deck: how to build with it

Disaster Deck is built on USWDS 3.14 (U.S. Web Design System) tokens and patterns, rebuilt in Tailwind. It should look like a default government website. No `·` separators, no `→` arrows, no glyph dots, no `…`, no uppercase letter-spaced labels, no mono: separate fields with words and commas, and write headings in sentence case. Every screen answers five questions about a thing on the desk: how bad (`tier`), how sure (`confidence`), how old (`observedAt`), who is on it (`assignee`/`history`), where (`coords`). Each field owns exactly one visual channel. Never reuse a channel for something else.

## Setup

No provider. Load `styles.css` (it pulls in Source Sans 3 from Google Fonts, the tokens and every utility class below) and `_ds_bundle.js`, then use `window.DisasterDeck.*`. Put the page on `bg-paper text-ink` (white). Every component that shows an age takes `now` (epoch ms, e.g. `Date.now()`) and dates as `Date` or ISO strings.

## The encoding (do not break it)

- Red (`act`, USWDS secondary-dark) means "a person must act now": tier 0, overdue task, critical incident, queue stuck > 30 s. Nothing else is ever red. No red errors, no red decoration.
- Blue (`primary`, USWDS primary) means "you can click this": buttons, links, the current tab or nav item, focus. Nothing that isn't clickable is blue.
- Tier is the card's 0.5rem left bar: 0 `bg-act`, 1 `bg-urgent` (USWDS warning gold), 2 `bg-calm`.
- Confidence is the border style, never colour: `unconfirmed` dashed, `corroborated` thin solid, `confirmed` thick solid.
- Type: `font-sans` (Source Sans) for all text, headings included. Headings are `font-bold`, never serif, never italic, never mono. Who said something is a bold name label ("**Agent:** Please call Örnek St. 12", "**x-agent**, report from x, 4 min ago"), never a typeface.
- Status is a USWDS tag: `whitespace-nowrap rounded-tag bg-muted px-2 font-sans text-xs uppercase text-card`, underscores shown as spaces. Status never gets a colour.

For any record, reach for `RecordCard` (or the list wrappers `SiteCards`, `NeedCards`, `ShelterCards`, `RoadCards`, `IncidentCards`, `TaskCards`) instead of drawing a card. Use `TaskCard` for anything with Accept / Decline / Done / Problem, `Stamp` for "source, age", `HealthLine` for queue state, `ChatLine` for chat, `EventRow` inside a `<ul>` for feeds, `BoardTabs` for the board, `Nav` for the top bar.

## Buttons and links (USWDS patterns)

| Pattern | Classes |
|---|---|
| primary button (one per card or form) | `rounded-button bg-primary px-3 py-1.5 text-sm font-bold text-card hover:bg-primary-dark` |
| outline button (the other actions) | `rounded-button px-3 py-1.5 text-sm font-bold text-primary` + inset 2px primary ring: `shadow-[inset_0_0_0_2px_var(--color-primary)]` |
| act button (only "Problem", help needed now) | `rounded-button bg-act px-3 py-1.5 text-sm font-bold text-card` |
| link | `text-primary underline hover:text-primary-dark` |
| input | `rounded-button border border-muted px-2 py-1.5 text-sm` |

Focus is global: a 0.25rem `#2491ff` outline on `:focus-visible`. Never add `outline-none`.

## Styling vocabulary (Tailwind v4, precompiled)

Only classes already in `_ds_bundle.css` exist. Tokens:

| Family | Classes | CSS var |
|---|---|---|
| colour | `bg-` / `text-` / `border-` + `paper card ink muted line act act-soft urgent calm hatch primary primary-dark primary-lighter focus` | `var(--color-primary)` etc. |
| radius | `rounded-card` (0.5rem), `rounded-button` (0.25rem), `rounded-tag` (2px) | `var(--radius-card)` |
| type | `font-sans`, `text-xs text-sm text-base text-lg text-xl`, `font-medium font-semibold font-bold`, `uppercase` (tags only), `capitalize`, `underline` | |
| layout | `flex grid flex-col flex-wrap flex-1 items-center items-baseline justify-between shrink-0 min-w-0 w-full truncate`, `gap-`/`p-`/`px-`/`py-`/`mt-`/`mb-`/`space-y-` 0 to 8, `grid-cols-1..4` (also `md:` / `lg:`) | |

Never write hex colours or Tailwind palette colours (`bg-red-600`, `text-blue-700`). If a class you want is not in the list, use an inline style with the token var.

Section headings look like `text-lg font-bold` (page titles `text-xl font-bold`). Panels are `rounded-card border-2 border-line bg-card p-3`.

## Data shapes (from lib/types.ts)

```ts
type Tier = 0 | 1 | 2; type Confidence = "unconfirmed" | "corroborated" | "confirmed";
type Source = "x"|"news"|"reddit"|"instagram"|"facebook"|"sheet"|"nasa"|"person"|"system";
type HistoryEntry = { ts: Date; by: string; source: Source; reason: string };
Site    { _id; address; region; peopleTrapped; callStatus: "not_called"|"called"|"verified"; status: "open"|"team_on_site"|"closed"|"retracted"; sources: {source; eventId}[]; history; confidence; observedAt; tier; priority; support }
Need    { _id; item; quantity; region; siteIds; status: "proposed"|"open"|"assigned"|"on_the_way"|"delivered"|"cancelled"; history; confidence; lifeThreatening; lines; tier; priority; support }
Shelter { _id; name; region; bedsUsed; bedsTotal; updated; observedAt; history }
Road    { _id; road; state: "open"|"closed"|"unconfirmed"; reason; history; confidence; observedAt }
Incident{ _id; kind; severity: "low"|"high"|"critical"; canContinue; text; textEn; status: "open"|"helping"|"escalated"|"resolved"; actions: {ts; what}[]; history }
Task    { _id; type; recordType; recordId; assignee?; tried: string[]; risk; tier; priority; status; open; title; detail; deadline; history }
```

`text` is the original (often Turkish), `textEn` the translation. Show both: English first, original under it in `text-xs text-muted`. Stamps read "IG, 4 min ago", scores read "Priority 54".

## Example

```jsx
const { RecordCard, HealthLine } = window.DisasterDeck;
const now = Date.now();
<main className="bg-paper text-ink p-4 space-y-3">
  <header className="flex items-baseline gap-3">
    <h2 className="text-lg font-bold">Sites</h2>
    <span className="ml-auto"><HealthLine pending={3} oldestPendingSeconds={2} /></span>
  </header>
  <RecordCard type="site" title="Örnek St. 12" detail="1 person trapped. Call status: not called." tier={0} priority={54}
    confidence="corroborated" status="open" at={new Date(now - 14 * 60000)} source="x" sources={4} now={now} />
  <button className="rounded-button bg-primary px-3 py-1.5 text-sm font-bold text-card hover:bg-primary-dark">Assign team</button>
</main>
```

The full visual language, the USWDS token map and the reasoning: `guidelines/` (Frontend visual language).

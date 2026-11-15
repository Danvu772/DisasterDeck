---
id: t22-panel-push
effort: medium
checkpoint: polish
files: app/page.tsx, components/LiveBoard.tsx, components/BoardTabs.tsx, components/detail/DetailPanel.tsx
---
# The detail panel pushes the board aside instead of covering it

Dan: "when the sidebar opens on card click, it covers the whole website. Make the cards move."

Today `DetailPanel` is `fixed` over the right 45% (`md:w-[45%]`, `z-[1100]`) while `/` keeps its `max-w-6xl` centred column underneath, so the panel hides most of the board.

## Wanted (md and up)
- **Split view.** When `?open=` is set, the page becomes two columns under the nav: the board on the left, the panel on the right (about 45%, at least 420 px). Both scroll on their own, full height. The board stops being a centred `max-w-6xl` column while the panel is open, it fills the left column with normal padding.
- **The cards reflow.** The tab grid uses fewer columns while the panel is open (1 column at `md`, 2 at `lg`, 3 at `2xl`) instead of `md:grid-cols-2 lg:grid-cols-3`.
- **Motion.** The panel slides in from the right and the board's width eases, about 200 ms ease-out. Respect `prefers-reduced-motion` (no slide, instant). Closing reverses it.
- **Keep the clicked card in view.** After the layout changes, scroll the open card into view inside the board column (`scrollIntoView({ block: "nearest" })`), so the user still sees what they clicked. Switching records through linked records does the same for the new card when it is on the current tab.
- The people cards and Ask the desk stay at the top of the board column and reflow too.

## Phone (below md)
Unchanged: the panel stays a full-screen sheet with Close. There is no room for both.

## Notes
- The open state lives in the URL (`useSearchParams().get("open")` in `BoardTabs`). The layout wrapper needs the same signal: read it in `LiveBoard` (it is a client component) or lift it, whichever is less code.
- The panel's Leaflet map must re-measure after the slide (`invalidateSize`, `KeepSized` in the map code already does this through a ResizeObserver, check it still fires).
- Escape, Close and `?open=` links keep working.

Accept when: at 1440 by 860 with a card open, the board and the panel are side by side, no card is hidden under the panel, and the opened card is visible.

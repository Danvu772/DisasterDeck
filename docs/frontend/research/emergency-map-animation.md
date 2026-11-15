# Emergency map: data flows and bounded animations

Research note by Role 3, 15 Nov 2026. It covers what the sources say, how data moves through this app today, and which animations are worth building. The proposals are not built yet.

## Bottom line

The app uses Leaflet with react-leaflet, not Mapbox (`package.json`, `components/map/DeskMapView.tsx`). Mapbox Studio is not in the stack. Keep Leaflet for the 15 Nov demo. The animations below work in Leaflet with CSS and a few map calls. Mapbox would need an access token and a deliberate switch, and the research does not show it would be worth that cost before the demo.

Two things in the research were thin:

- The Mapbox Studio manual page returned 404, so this note has no source on what Studio produces. The Map API page only says Studio is at studio.mapbox.com.
- No source gave colour or symbology rules for incident maps. The FIRESCOPE paper covers process, not symbols.

## What the sources say

**Mapbox GL JS (checked by a subagent, see the caveat below)**

- The camera-animation example calls `map.flyTo(options)` with `duration`, `easing`, `offset`, `animate` and `essential`. A code comment on `essential` says it keeps the animation running when the user has `prefers-reduced-motion` on. (https://docs.mapbox.com/mapbox-gl-js/example/camera-animation/)
- The Map API constructor has `respectPrefersReducedMotion`, default `true`. When it is `true`, the map "minimizes animations and transitions" for users who ask for reduced motion. (https://docs.mapbox.com/mapbox-gl-js/api/map/)
- The same page has `scaleFactor` and `setScaleFactor()` for scaling symbol text and icons, described as an accessibility aid. It is marked experimental.

Caveat: the subagent's summary of the `flyTo` and `easeTo` reduced-motion behaviour came from a model summary, not from verbatim page text. Check those two sentences on the page before quoting them.

**FIRESCOPE white paper, Incident Dashboard, WebApp and Web Map Best Practices (4 Apr 2024)**

- Use the most authoritative data, not copies. It is written for wildfire, but says the guidance holds for all hazards.
- It is updated annually by the GIS Subcommittee. (https://firescope.caloes.ca.gov/SiteCollectionDocuments/FIRESCOPE%20GIS%20Incident%20Dashboard%20Webapp%20Webmap%20Best%20Practices%20White%20Paper.pdf)
- It has no symbology, colour, or animation guidance.

**Search results (snippets only, not read in full)**

- The National Academies report on geospatial support notes that the first request from an incident commander is often a map, and it is needed fast. That argues for the map loading first and staying prominent. (https://www.nationalacademies.org/read/11793/chapter/6)
- Esri's dashboard guidance separates operational layers from map design, and says a hidden layer can still feed other dashboard elements. (https://enterprise.arcgis.com/en/dashboards/11.0/reference/create-web-maps-for-dashboards.htm)
- Stamen's disaster-tool writeup argues that familiar patterns are often the best choice for emergency users. (https://stamen.com/?p=22078)
- A Mapbox GL JS issue thread raises reduced motion and sudden appearance changes as concerns for users with vestibular disorders. (https://github.com/mapbox/mapbox-gl-js/issues/8288)
- A wildfire tracker write-up says satellite-derived detections should read as awareness, not as an official source, and should show confidence. (https://vp0.com/blogs/wildfire-tracker-map-overlay-ui-react-native.md)

## Data flows in this app today

```
X agent, NASA watcher, person on the desk, field phone
        │  POST /api/events  (typed, validated, dedupeKey)
        ▼
events collection  (status: pending → done)
        │  Brain: keeper applies one event at a time
        ▼
sites · needs · roads · shelters · incidents · tasks · zones
        │  GET /api/board every 1 s  (usePolled, DeskMap)
        ▼
Leaflet map: markers (tier colour, confidence border, stale fade)
        +  /data/zones.geojson  (static, Role 4)
```

Facts from the code that matter for animation:

- The map polls the board every second (`components/map/usePolled.ts`). Any animation has to be triggered by a diff between two polls, not by a server push. There is no push channel.
- Focus already uses `flyTo` with a 0.4 s duration (`DeskMapView.tsx` line 57). Changing focus is the only camera move today.
- Markers already encode tier (colour), confidence (border), and staleness (fade) (`markers.ts`, `encode.ts`). Those are the channels to keep. Motion should be a fourth channel, not a replacement for these.
- `observedAt` is the true age of a fact, so "since you last looked" can be computed on the client without server help.
- Sites now carry `posts` and `scoreParts` in the v2.2 contract (P-002), so a card can show why a site is where it is.

## Animation proposals

Each one is bounded: it has a trigger, a length, and a cap. None loops.

| # | What moves | Trigger | Length and cap | Reduced motion | What the operator learns |
|---|---|---|---|---|---|
| A | New critical site: one expanding ring around its marker | A tier-0 site appears between two polls | One ring, about 1.2 s, stops | Static outline, no ring | Something new needs attention, and where |
| B | Team route: dashed line draws from the team to the site | A team marks "on our way" (`progress: en_route`) | One pass, 1.2 s, stays as a line until arrival | Line appears at once | Who is heading where, and how far |
| C | Arrival: marker changes from pending to on-site | `progress: arrived` or site `team_on_site` | Colour cross-fade, 300 ms | Instant change | The site is being covered |
| D | Silent zones fade in once | Zones load for the first time | Opacity 0 to 1 over 300 ms, once | Instant | The shaded areas are NASA evidence, not a guess |
| E | Count-up on a site's post count | A new post arrives on a site already on screen | Number ticks to the new value, 400 ms | Instant | The site is getting more reports |
| F | Feed-to-map highlight | The coordinator clicks a feed entry | One flash on the marker, 600 ms, then static | Outline only | Which record the feed entry is about |
| G | Camera move on new critical site | Only if the critical site is outside the view | `flyTo` 0.4 s, at most once per site | No camera move. The marker stays put and shows a count of off-screen criticals | The operator is not thrown across the map |

### Avoid

- Continuous loops: radar sweeps, pulsing markers that never stop. They bury the board and make the screen look busy during a real incident.
- A camera move on every poll. A `flyTo` each second moves the map out from under the operator. Move the camera only on a named trigger, as in G.
- Flashing faster than three times a second. WCAG 2.3.1 sets that limit for seizure risk. Keep every flash well under it.
- Bounce and easing that overshoots. Overshoot reads as playful, and this screen is for triage.

### Why these

Every proposal ties motion to a state change that already exists in the data (a site's tier, a team's `progress`, a post count, a zone load). That keeps animation honest: nothing moves unless a record changed. It also keeps the motion short enough that an operator who blinks misses nothing, because the static state is still on screen after.

## Standing out without hype

The marketable part is not a flashy map. It is a "since you last looked" view: what changed on the desk since the screen last polled, with ages from `observedAt` on each change. That is the thing the pitch can show in two minutes ("today vs. with the desk", already a task in the frontend plan). Animations A, E and F are what make that change visible on the map. Each one can be shown on a slide as a before and after frame, which is easy to put in a pitch.

## Decision for the team

- **Keep Leaflet for the demo.** Build A to F in Leaflet. Estimated work is small, because each is a CSS class or a layer call.
- **Mapbox only as a later spike,** if the team wants vector tiles, after the demo. It needs a token and a new dependency.

## Built (15 Nov)

- **A, new critical record:** one ring around the marker, 1.2 s, only for a critical site or incident that is new since the first live board. Opening the page does not ring everything.
- **D, zones:** silent and cold zones fade in once when their layer mounts (300 ms).
- **F, feed to map:** the record in `/map?focus=` gets one 600 ms flash, then stays static.
- **G, off-screen criticals:** a button shows how many critical records are outside the view. It moves the view only when clicked, never on its own.
- **Reduced motion:** every motion above is turned off by `prefers-reduced-motion: reduce` in `app/globals.css`. The state each one shows stays on screen.
- **Marker reuse:** icons are cached by content, so a one-second poll does not rebuild a marker and restart its animation.

## Deferred, and why

- **B, team route line:** the board carries no team positions. The route needs each assignee's coordinates, which means an API change (a gap for Role 1).
- **C, arrival cross-fade:** a colour fade needs the same marker element to survive a change. Today a state change replaces the marker's HTML, so there is nothing to fade.
- **E, count-up on post counts:** that number lives on the site card, not on the map.

## Next steps

1. Read the Mapbox `flyTo` and `easeTo` reduced-motion sentences on the page directly, and fix the caveat above.
2. Find a working Mapbox Studio page to cite, and replace the 404 link.
3. Test every motion on a phone with the system reduced-motion setting turned on, in a browser that can run the page.
4. Decide on B with Role 1: the team positions it needs are an API change.

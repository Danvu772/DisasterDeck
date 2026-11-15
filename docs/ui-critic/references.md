# UI critic — reference sites

Issue #37. Checked 15 Nov 2026 in the built-in browser: every site below opens without a login.
The critic uses the two **picked** sites (set in `.claude/skills/ui-critic/config.json`).
To switch, edit `references` and each route's `compareWith` there.

| Site | URL | Why it is good | Fits our screens | Picked |
|---|---|---|---|---|
| Watch Duty | https://app.watchduty.org | Live incident map with a side list; each card shows status, age, size and containment; icon-coded severity; mobile-first. | map, field phone, coordinator list | **yes** |
| HOT Tasking Manager | https://tasks.hotosm.org/explore | Volunteer task cards with difficulty, progress, contributors and priority; clear filters; pick-and-claim flow. | volunteer, coordinator tasks | **yes** |
| USGS Latest Earthquakes | https://earthquake.usgs.gov/earthquakes/map/ | Earthquake list linked to the map; simple filter and sort; aligned magnitudes. Closest topic to our scenario. | map, coordinator | no (overlaps Watch Duty) |
| Grafana Play | https://play.grafana.org | Ops dashboard: KPI tiles, dense but readable grid, dark theme. | coordinator desk | no |
| NASA FIRMS | https://firms.modaps.eosdis.nasa.gov/map/ | Satellite layers, legend and time-range picker; we also use NASA data. Opens with a disclaimer dialog. | map layers and legend | no |
| ElevenLabs Conversational AI | https://elevenlabs.io/conversational-ai | Voice agent widget: chat/voice toggle, "talk to an agent" button, message bubbles. | talk / voice | no |

Dropped: PulsePoint Respond (web.pulsepoint.org) opens without a login but shows an empty page until
you pick an agency.

Gap: neither picked site covers the talk/voice screen. The `talk` route is checked against our own
design rules only. Add ElevenLabs to `references` if that screen needs a comparison.

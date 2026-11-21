# Disaster Deck

[![CI](https://github.com/DarshalShetty/HackTheNest26/actions/workflows/ci.yml/badge.svg)](https://github.com/DarshalShetty/HackTheNest26/actions/workflows/ci.yml)

Current pilot: **Antakya, Türkiye, February 2023**. Users, reports, shelters and logistics are synthetic and arrive through the event queue (D-0017). Satellite imagery, NASA measurements and the separately credited HOT/OSM reference building database are historical real data.

## Field voice

The field phone (`/field`) has hold to talk. It only dictates: the phone's own speech recognition (Web Speech API with `processLocally: true`, so recognition runs on-device and no audio or text goes to Google) types what the person says into the prompt box. Where on-device recognition is unavailable the hold-to-talk button is off and typing is the fallback. **Send** asks the agent exactly as the agents tab does (`src/components/agent/askDesk.ts`), and the same chart space shows the metric cards and map answers at the bottom of the screen. Talking needs HTTPS or localhost and a browser with on-device speech recognition (Chrome). Typing works everywhere.

## Run the map on your workstation

Install Node.js **22.18+ or 24 LTS**, including npm, and Git. In this repository:

```sh
git pull --ff-only origin main
npm ci
npm run check:pilot
npm run demo -- --port 3672
```

Open [http://127.0.0.1:3672/map](http://127.0.0.1:3672/map). Keep the terminal running. If that port is occupied, use `--port 3673` and open that port instead. On Windows, restart PowerShell after installing Node if `node` or `npm` is not recognized.

The packaged imagery, NASA layers and reference buildings require **no Earthdata login, AWS account, Python, Git LFS or extra data download**. All 3,060 image tiles (about 50 MiB), GeoJSON files, lossless NASA numeric subsets and provenance records are regular Git files. The street basemap uses an external internet service. `npm run demo` provides temporary local Auth.js settings; real SSO configuration is separate.

In the map evidence panel:

1. Use **Buildings · high-resolution comparison** and **Inspect buildings up close**.
2. Move the **before/after divider**. Source imagery is 22 December 2022 and 11 February 2023; native source GSD is about 0.50–0.67 m and exported map tiles are approximately 0.96 m.
3. At zoom 15+, click a reference building for its mapping source and a local human review note. Export notes to share them; they are stored in the browser, not MongoDB.
4. Select **NASA · Night-light change** to inspect quality-filtered measured values for paired ~500 m pixels. Enable observation limits to see where a usable comparison is unavailable.
5. **Show whole city area** resets the larger city study view. The submeter-source imagery covers the central study rectangle, not the entire province.

No automated damage classifier is bundled. Destroyed-building outlines are an external historical HOT/OSM reference, not predictions by this application. Unmarked buildings are not declared safe. [Data and reuse terms](public/data/antakya/ATTRIBUTION.md).

## Connect the shared pipeline

Copy `.env.example` to `.env.local` and fill the privately supplied MongoDB URI, worker `AGENT_KEY`, model credentials and any real SSO settings. Keep `DESK_ID=antakya-2023` in **every** app and worker session. Stop old Malatya worker processes before restarting; an environment variable overrides code defaults.

Coordinate the seed with the shared database owner. Run only one shared Brain; if the team already has one running, its operator updates the environment and restarts it.

```sh
npm run db:check
npm run db:seed
npm run brain
```

Every input is posted to `POST /api/events` (D-0017); there are no input workers in this repo yet. `db:seed` updates the shared synthetic user IDs and does not erase old Malatya cases or events. Coordinate a shared seed/reset with the team; separate deployments can use a separate `MONGODB_DB`. Upstream now includes core person-event handlers, dispatcher tasks and inbox APIs. NASA alerts, capacity/road handling, interruption recovery and live acceptance still need the work listed in the [updated pipeline completion plan](docs/completion-plan.md).

## Data and implementation details

- [Antakya pilot and reproduction](docs/antakya-pilot.md)
- [NASA evidence and quality](docs/nasa-evidence.md)
- [Atlas controls and observation limits](docs/nasa-atlas.md)
- [Current demo and rehearsal](docs/demo.md)
- [Timestamped release notes](docs/role-4-changelog.md)

The existing narrated video and screenshots depict the earlier Malatya build. Record a new Antakya demonstration before submission.

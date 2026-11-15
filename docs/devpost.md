# Disaster Desk

**Tagline**

Give volunteers, field teams and suppliers one place to see who owns the next action after a disaster.

## Inspiration

Imagine volunteering at a call desk. Four posts say Ayşe is trapped at Turuncu Avlu. Should you make a fourth call, or has someone already reached her? Meanwhile a fifth post describes two people at a different address. We built Disaster Desk around the question the next volunteer needs answered first: “Who is already on this?”

## What it does

Our Malatya exercise replays five synthetic Turkish reports. The comparison screen shows the original messages beside two case cards. A volunteer can see that Zeynep owns the callback for the first address and the second address still needs a caller. A separate coordinator screen shows the dispatch awaiting a decision, the person or source behind it, and delivery problems that need attention. The video shows these screens with labeled demo cases.

## How we built it

The desk uses Next.js, React and TypeScript. Workers send typed events to a shared endpoint. MongoDB stores the records. The agent code uses Anthropic Claude for language processing and includes Claude web search for research. We built a five-step scenario player so a team can repeat the same blanket request, shelter update, road closure, breakdown and repair. It saves the original event key and target before sending, so an interrupted rehearsal can resume against the same delivery.

## What NASA data changed

In Malatya, NASA POWER's MERRA-2 data records a minimum of **−14.38 °C on 9 February 2023**. It is one regional estimate on a 0.5° × 0.625° grid, roughly 50 km across. We ran the worker against the archive. It generated a cold alert for each of our two demo cells from that same observation. This gives the team a dated reason to review a blanket request. [NASA POWER observations for 6–10 February](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN&community=RE&longitude=38.31&latitude=38.35&start=20230206&end=20230210&format=JSON)

The 10 February ARIA Damage Proxy Map uses ESA Sentinel-1 radar at about 30 m. Radar changes can also reflect vegetation or terrain. We compared the overlay at Yeni Cami with a dated report of its collapse. The overlay is consistent with that report, but its transparent pixels leave valid coverage uncertain. The gap-filled Black Marble VIIRS night-light renderings from 3 January and 8 February use approximately 500 m pixels. Both selected city cells reach the top of the display scale. We leave damage and darkness unresolved and emit zero silent-zone alerts. [NASA Earthdata / ARIA](https://gis.earthdata.nasa.gov/portal/rest/services/DISASTERS_202302_EARTHQUAKE_TURKIYE/2302_opera_dpm/ImageServer) · [Black Marble product](https://ladsweb.modaps.eosdis.nasa.gov/filespec/VIIRS/2/VNP46A2_v2.0.fs) · [DHA field report](https://www.dha.com.tr/gundem/malatyada-depremde-yeni-cami-de-yikildi-2201455)

## What we learned and what comes next

Four reposts can represent one original call. Two map cells can share one weather measurement. Showing where a number comes from helps a coordinator decide how much weight to give it. Our next live milestone is to follow a 20-blanket request through supplier acceptance to an ETA on the field phone, and verify how a cold alert changes the order of otherwise comparable warmth requests.

## Data and tools

The reports, people, contacts, logistics and demo cells are synthetic. The NASA observations are historical. We credit the ARIA team at NASA JPL/Caltech and EOS-RS, Copernicus/ESA, NASA GIBS and Black Marble, NASA POWER/MERRA-2, and OpenStreetMap contributors for the landmark location. Development assistance included OpenAI Codex. The video uses an offline Windows narration voice.

Supported by the Michigan Space Grant Consortium, NASA grant 80NSSC20M0124.

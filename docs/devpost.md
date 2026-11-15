# Disaster Desk

**Tagline**

Give volunteers, field teams and suppliers one place to see who owns the next action after a disaster.

## Inspiration

Imagine volunteering at a call desk. Four posts say Ayşe is trapped at Turuncu Avlu. Should you make a fourth call, or has someone already reached her? Meanwhile a fifth post describes two people at a different address. We built Disaster Desk around the question the next volunteer needs answered first: “Who is already on this?”

## What it does

Our Antakya exercise replays five synthetic Turkish reports. The comparison screen shows the original messages beside two case cards. A volunteer can see that Zeynep owns the callback for the first address and the second address still needs a caller. A separate coordinator screen shows the dispatch awaiting a decision, the person or source behind it, and delivery problems that need attention. The earlier recorded video uses the previous Malatya iteration and must be replaced before submission.

## How we built it

The desk uses Next.js, React and TypeScript. Workers send typed events to a shared endpoint. MongoDB stores the records. The agent code uses Anthropic Claude for language processing and includes Claude web search for research. We built a five-step scenario player so a team can repeat the same blanket request, shelter update, road closure, breakdown and repair. It saves the original event key and target before sending, so an interrupted rehearsal can resume against the same delivery.

## What NASA data changed

In Antakya, NASA POWER records a regional minimum of **-1.05 C on 9 February 2023**, and -3.11 C on 10 February. These are coarse regional weather estimates. The scenario watcher produces two cold alerts from the shared 9 February observation; a live Brain-driven priority change remains an integration acceptance step.

We also processed original NASA Black Marble radiance and quality flags for 3 January and 8 February. Among 92 eligible paired ~500 m pixels with a sufficiently bright baseline, 56 show at least 40% lower radiance. The map exposes measured values, dates and excluded observations. This is a regional screening signal, not a count of damaged buildings or proof of people trapped. ARIA radar surface-change evidence retains its validity limitations, so no silent-zone alert is asserted.

For building-level visual inspection, the map compares real Maxar WorldView-2 imagery before and after the earthquake, with approximately 0.50-0.67 m source GSD, exported as ~0.96 m local tiles. It includes 743 separately credited historical HOT/OSM destroyed-building polygons and local human review notes. We have not run or validated our own damage classifier. The images and reference database have provider-specific licenses and are not NASA products. All final display data is committed so teammates can run the map without new downloads or Earthdata credentials.

## What we learned and what comes next

Four reposts can represent one original call. Two map cells can share one weather measurement. Showing where a number comes from helps a coordinator decide how much weight to give it. Our next live milestone is to follow a 20-blanket request through supplier acceptance to an ETA on the field phone, and verify how a cold alert changes the order of otherwise comparable warmth requests.

## Data and tools

The reports, people, contacts, logistics and demo cells are synthetic. The NASA observations are historical. We credit the ARIA team at NASA JPL/Caltech and EOS-RS, Copernicus/ESA, NASA GIBS and Black Marble, NASA POWER/MERRA-2, Maxar Open Data Program (CC BY-NC 4.0), and HOT/OpenStreetMap contributors (ODbL-1.0) for the building reference database. Development assistance included OpenAI Codex. The video uses an offline Windows narration voice.

Supported by the Michigan Space Grant Consortium, NASA grant 80NSSC20M0124.

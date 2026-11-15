# Semantic asks to quantitative charts

Rule (Dan, 15 Nov): a question becomes a chart only when it is a quantitative ask. The agent and the screen classify the ask into one of twelve intents, each intent gives one data shape, each shape has its chart. Nobody improvises a chart, the same way rules (not the LLM) allocate work in the Brain.

## 1. Intents (what people actually ask)

| Intent | Example phrasings | Quantitative question |
|---|---|---|
| amount | how many trapped, how many blankets | count or sum |
| capacity | are shelters full, can we take 20 more | used / limit |
| speed | how fast are approvals, who waits longest | durations, p50 and p90 |
| freshness | is this still true, how old is that count | age, 0.5^(age / half-life) |
| trust | can we believe this, is it confirmed | reliability x credibility (Admiralty) |
| reach | who is closest, is anyone near Kale | distance, share covered within a radius |
| trend | is it getting worse, what changed since I looked | values over time, deltas |
| priority | what first, what is most urgent | ranked items with score parts |
| status | how are the roads, where are the tasks at | counts per category |
| progress | did anyone reach Ayşe, is it moving | counts and times per stage of the loop |
| gaps | what don't we know, where is the blind spot | unknown share, missing fields, silent zones |
| compare | A vs B, before vs after | paired values, difference |

Anything else (greetings, instructions, "tell my team...", "pull the map", reports, needs) is **not** quantitative: text only, no chart.

## 2. Data shapes

scalar + reference, ratio to a limit, distribution, categorical counts, ranked list, time series, matrix, spatial, stages.

## 3. Modalities

| Modality | Shape | Status |
|---|---|---|
| stat (big number, delta, source) | scalar | new |
| gauge or bullet | ratio | built |
| bars | categorical, ratio per item | built |
| stacked bar | status mix | new |
| percentile strip | distribution | new |
| sparkline or line | time series | new |
| ranked list with score bars | ranked list | new |
| matrix heatmap | matrix | built |
| stage track | stages | half built (/demo) |
| snapshot table | sitrep, many shapes | built |
| map: fly and highlight, reach rings, zone shading, marker size | spatial | mostly built, reach rings new |
| sentence in chat, voice read-back, badge, deep link | any | sentence and link built |

## 4. Intent to metric today

capacity: shelters. speed: sla_t0, logistics. freshness: freshness. trust: credibility. reach: coverage. status: lifelines, ics209. gaps: ics209 (unknown lines), freshness. trend, priority, progress, compare, amount: **no metric yet**.

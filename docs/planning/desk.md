# Desk

Nov 17, 2026 · Dan Vu

Every stack call is made. What's left is real-world: talk to Ömer, set up AWS, and email IU about I-Corps and the tabletop pilot. New: a standing DHS funding door is open (see [Funding](funding.md)).

Full reasoning for every stack call is in [Stack review](stack-review.md).

## Approved

| # | Call | Why | Decision |
| --- | --- | --- | --- |
| 1 | Replace SSOJet with Amazon Cognito, federated to each agency's Entra ID or Okta | SSOJet is a tiny vendor with no government listing; agencies want staff on their own logins | Approve |
| 2 | Public users: no-login emergency reports by default, Login.gov optional | Speed in a disaster beats accounts; Login.gov is open to states | Approve |
| 3 | **gpt-oss-120b** (OpenAI's open-weight model) through OpenRouter, US-only routing. gpt-oss-20b for small tasks. No DeepSeek, no Claude | About $0.04 in / $0.17 out per million tokens, roughly 7× cheaper than DeepSeek V3.2. Supports tool calling and structured output, and is US-built, so no state ban list applies. A pilot month costs about $4 instead of $19. Weaker than frontier models on hard multi-step agent work | Approve |
| 4 | Keep MongoDB, moving to Atlas for Government; DocumentDB as fallback | FedRAMP Moderate and no rewrite | Approve |
| 5 | Voice: Amazon Transcribe and Polly by default, ElevenLabs for Government as an option | Keeps audio inside our AWS boundary | Approve default for now; check pilot-area languages later |
| 6 | Maps: MapLibre, with US-hosted basemaps (Esri, FedRAMP Moderate) and our own OSM tiles on AWS as the fallback; drop Mapbox and Leaflet | Agencies already run ArcGIS; self-hosted tiles survive outages | Approve |
| 7 | Compute: ECS Fargate across Availability Zones, not a single VM | A disaster tool can't have one point of failure | Approve |

## Pilot target

Start with a tabletop exercise at IU Emergency Management. A tabletop exercise uses no real data, so it needs no compliance paperwork. That wins a first reference this spring.

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| IU Emergency Management (tabletop) | On campus; easiest yes; IU is a public university, so it counts as a government reference | Smaller scale than a county; campus incidents, not regional disasters | Approve |
| Monroe County EMA, Indiana | Local, so you can meet in person; small office that's open to student builders | No personal story here; Indiana's state rules apply later | Hold |
| Maui County EMA, Hawaii | The Lahaina story; the clearest gap (no alerts, separate radio channels); multilingual population | Remote from Bloomington; a real deployment needs Hawaii's state review | Hold |

## Field dictation

By default, Chrome sends Web Speech audio to Google's servers for transcription ([MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)). The repo README's claim that no audio leaves the phone is wrong. Chrome added an on-device mode in 2025: with `processLocally: true`, neither the audio nor the text leaves the device ([Chrome](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM)).

Decision: on-device only (`processLocally: true`), with typing as the fallback where it isn't available. Never Google's cloud path.

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| 1. Chrome on-device (`processLocally: true`) | Free; private; works offline in a disaster | Only languages Chrome has downloaded; not every phone or browser supports it | Approve |
| 2. Amazon Transcribe (server) | Already the approved voice default; inside the AWS boundary; works on any phone | Needs a network connection; costs per minute | Reject |
| 3. Whisper running in the browser | Offline on any modern browser; many languages | Large model download; slow on cheap phones | Reject |

## Blocked on a person

- [ ] **Code ownership: Dan owns the fork.** His call (Nov 17): everything on the fork is his and nothing goes to the team. What's left is adding the AGPL LICENSE file when he publishes.
- [ ] **Talk to Ömer: cofounders, with Dan as operator and Ömer as visionary.** Cover the cofounder roles; the fork and its design are Dan's either way.
- [ ] **Rotate every hackathon secret. The fork is Dan's, so every key is new.** Vultr is being retired. Darshal owns the old Atlas cluster, so Dan creates his own Atlas cluster and connects it. Issue fresh keys for OpenRouter, NASA and anything else the fork calls; don't carry over the Anthropic, SSOJet or old ElevenLabs keys. Still open: who controls `disasterdeck.us`?
- [ ] **Open the AWS account.** Guide in [AWS setup](aws-setup.md), about 45 minutes.

After the Ömer conversation:

- [ ] **Trademark "DisasterDeck."** Anyone can fork the code, but only we can use the name. Around $350 per class; run it past IU tech transfer or a startup lawyer first.
- [ ] **Set up the official GitHub organization**, with a contributor agreement (CLA), an AUTHORS file and a short governance doc naming the founders.
- [ ] **Publish the repo under AGPL** whenever Dan is ready. This is also step one for the PESOSE application.
- [ ] **Ask IU's tech transfer office when the next regional I-Corps cohort starts.** Dan would be the entrepreneurial lead.
- [ ] **Get IU's written OK that DisasterDeck isn't IU property.** IU owns what's made with IU funding, IU resources or within the scope of employment. DisasterDeck came from a hackathon at EMU, so it should belong to the team, but get IU's innovation and commercialization office to confirm in writing before charging anyone. Until then, keep it off IU laptops, servers and lab hours.

## Funding track

Go in this order: I-Corps teaches customer discovery, PESOSE funds the open-source project, and STTR funds the company. Each step makes the next one easier to win. DHS and FEMA options are in [Funding](funding.md).

| Order | Program | Amount | Next deadline | What you need first |
| --- | --- | --- | --- | --- |
| 1 | NSF I-Corps (regional course, then national) | Up to $50K for national teams | Rolling; ask IU tech transfer for the next regional cohort | Entrepreneurial lead, plus a faculty lead and a mentor; 20–100 customer interviews |
| 2 | NSF PESOSE Phase I (open-source ecosystems) | Up to $300K for 1 year | Mar 2, 2027 (realistically the following round) | Repo public under AGPL, with real users and contributors documented |
| 3 | NSF STTR Phase I | Up to $305K | Jul 7, 2027 full proposal; a Project Pitch and an invitation come first | A company, plus IU as research partner. STTR fits a PhD student better than SBIR, since SBIR requires the PI to be at least 51% employed by the company |

- [ ] Email IU tech transfer: next I-Corps regional cohort, and who can serve as faculty lead.
- [ ] Submit the STTR Project Pitch in spring 2027 (about three pages) so the invitation lands before July 7.

## Research queue

| # | Question | Status |
| --- | --- | --- |
| 1 | What do state emergency management agencies already buy (WebEOC, Veoci, Everbridge, ArcGIS-based tools)? Where's the gap? | Done: [Market](market.md) |
| 2 | Open SBIR and BAA calls for disaster-coordination tech (DHS S&T, FEMA) | Done: [Funding](funding.md) |
| 3 | How software becomes an IPAWS alerting tool: steps and timeline | In progress |
| 4 | Government status of Mapbox, Exa, Tailscale and Twilio; whether Atlas for Government has reached High | Queued |
| 5 | What IU's IT security office needs before a tabletop pilot | Queued |

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-17 | AI model: gpt-oss-120b on OpenRouter, US routing | Cheapest US-built model with tool calling |
| 2026-11-17 | First pilot: IU tabletop exercise; Monroe County and Maui on hold | No real data, so no compliance paperwork |
| 2026-11-17 | Field dictation on-device only (`processLocally: true`), typing fallback | No audio leaves the phone |
| 2026-11-17 | Compute: ECS Fargate across availability zones | A disaster tool can't have one point of failure |
| 2026-11-17 | Voice: Amazon Transcribe and Polly as the default; ElevenLabs optional | Keeps audio inside the AWS boundary; check pilot languages later |
| 2026-11-17 | Dan owns the fork: his own Atlas cluster and fresh keys for every service | Darshal owns the hackathon Atlas; clean break from shared secrets |
| 2026-11-17 | DisasterDeck goes open source under AGPL. Anyone can run or host it ("open franchising"); we sell hosting, setup, training and support | Code is the marketing; agencies buy a vendor they can call. AGPL keeps everyone's improvements public. Pending team agreement |
| 2026-11-17 | Every login is optional; emergency reports need no login; Login.gov offered to the public | Speed in a disaster |
| 2026-11-17 | SSOJet out; replaced with a compliant identity provider | No government listing |
| 2026-11-17 | No Claude; model calls go through OpenRouter with US in-region routing | Dan's call |
| 2026-11-17 | Keep MongoDB on Atlas; MapLibre with US-hosted maps | No rewrite; agencies already run ArcGIS |
| 2026-11-17 | AWS replaces Vultr | Path to GovCloud (FedRAMP High) |
| 2026-11-17 | USWDS for the frontend | Federal design standard, built for Section 508 |

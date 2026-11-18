# What state agencies already buy

Nov 17, 2026 · Dan Vu

State emergency operations centers run on Juvare's WebEOC, with Everbridge for alerts and Esri for maps. The gaps RAND found in 2026 are coordination across organizations, services for survivors, and tools that keep working offline. The closest AI-native competitor is Disaster Tech's PRATUS.

## Who's in the market

| Vendor | What it does | Foothold | What it means for us |
| --- | --- | --- | --- |
| [Juvare WebEOC Nexus](https://www.juvare.com/products/webeoc-nexus/) | Emergency operations center software: incident coordination and resource requests. Also sells Crisis Track for damage assessment | Says it's used by over 90% of US state emergency management agencies, with 93% client retention | The incumbent. Integrate with it rather than replace it |
| [Veoci](https://dir.texas.gov/contracts/DIR-CPO-5533) | No-code operations center and continuity platform | Texas DIR cooperative contract; TxDOT had 1,400 staff on it during the January 2026 winter storm; county deals around $18.5K–$20K a year | A price anchor, and proof that cooperative contracts get vendors in |
| [Everbridge](https://www.everbridge.com/) | Mass notification and public warning; sends IPAWS alerts on behalf of state and local governments | 6,500+ organizations, including the State of Oregon | Owns alerting. Partner with it, don't build it |
| [Esri ArcGIS](https://esri.com/en-us/industries/emergency-management/solutions/damage-assessment) (Survey123, Dashboards) | Maps and damage assessment | FEMA publishes its preliminary damage assessment templates for Survey123; Oklahoma crowdsources damage reports with it | The data layer agencies already run. Read and write ArcGIS layers |
| [Disaster Tech PRATUS](https://www.carahsoft.com/disaster-tech) | AI incident management inside Microsoft Teams, on Azure Government | About $70M raised (Series B, Jun 2026); the US Coast Guard picked it as its incident platform in Feb 2026; sold through Carahsoft | Closest rival. Strong federally; it bets on Microsoft 365 |
| [Forerunner](https://www.withforerunner.com/post/building-stronger-safer-communities-forerunners-39m-in-funding) | Floodplain management, expanding into emergency management and grants | $39M raised; 180+ agencies in 26 states, including Florida's emergency management division | Adjacent and moving into our space |
| RapidSOS, Prepared | 911 data and AI for dispatch | RapidSOS has raised $450M+; Prepared $130M+ | The 911 lane, not the operations center. Integration targets |

## The gaps

RAND's 2026 landscape study ([report](https://www.aspendigital.org/wp-content/uploads/2026/08/RAND-AI-and-the-Future-of-Emergency-Management-Market-Supply-and-Adoption-Pathways-2026.pdf)) catalogued 1,179 AI-enabled products from 717 companies.

- 53% of products target response; preparedness gets 12%.
- Coordination across organizations, preparedness work and survivor-facing services are consistently underserved.
- Most products need continuous internet and stop working when connectivity fails.
- 68% of the companies don't advertise 24/7 support.
- State, local, tribal and territorial agencies are at the earliest stage of AI adoption. Funding, staff, IT capacity and procurement are the hardest constraints.

The Lahaina after-action reporting shows the same failure on the ground. With cell service down, residents got no alerts, and police and fire talked on closed radio channels other officials couldn't hear. The reports recommended a statewide mutual aid program and an evacuation plan for residents and tourists who speak different languages.

## Where the evidence points

- **Plug into WebEOC and ArcGIS, don't replace them.** States already pay for them and renew at high rates.
- **The open lane matches what DisasterDeck already does:** coordination across organizations, intake from survivors, and graceful behavior when the network drops.
- **Small vendors get in through cooperative contracts and resellers** (Texas DIR, TIPS, NASPO, Carahsoft), not full statewide RFPs.
- **County budgets are small.** Veoci renewals come in around $20K a year, so price for counties first.

## Open questions

- WebEOC's integration options for outside tools (API, Juvare Exchange): what's open to a small vendor?
- PRATUS pricing, and whether it has any state emergency management customers.

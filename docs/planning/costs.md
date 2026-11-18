# What each version costs

Nov 17, 2026 · Dan Vu

With gpt-oss-120b as the model, the hacky demo runs about $12 a month, a cheap pilot about $46, a pilot on Fargate about $109, and the full multi-zone production setup (the approved one) about $239. Moving to GovCloud adds roughly 10–30% to the AWS parts. The real price jump comes from the 2 NAT gateways and redundancy, not from the app itself.

Monthly estimates use AWS us-east-1 list prices (730 hours/month) as of Nov 2026; us-east-2 is essentially the same. LLM usage is assumed: 5M input and 1M output tokens for the demo, 50M/10M for a pilot.

| Layer | Hacky demo | Cheap pilot | Pilot on Fargate | Production (multi-zone) |
| --- | --- | --- | --- | --- |
| Hosting | Lightsail 2 GB box: $12 | Lightsail 2 GB box: $12 | Fargate, web + Brain at 0.5 vCPU/1 GB each: $36, plus 2 public IPs: $7 | Fargate, 2 web copies + Brain at 1 vCPU/2 GB: $72 |
| Load balancer | none | none | ALB: $22 | ALB: $22 |
| NAT gateways (private network) | none | none | none | 2 gateways + 50 GB: $68 |
| Database | Atlas M0 free: $0 | Atlas Flex (capped): up to $30 | Atlas Flex: up to $30 | Atlas M10 dedicated: $57 |
| AI (gpt-oss-120b on OpenRouter) | Pay-as-you-go, global routing: under $1 | Business plan with US routing, 8% fee: $4 | $4 | $4 |
| Login (Cognito) | free tier: $0 | $0 | $0 | ~200 federated staff: $2 |
| Maps (ArcGIS, 2M free tiles/month) | $0 | $0 | $0 | $0 |
| Secrets + logs | none | none | ~$9 | ~$14 |
| Voice | browser dictation: $0 | tabled | tabled | tabled |
| **Total / month** | **~$12** | **~$46** | **~$109** | **~$239** |

## What you give up at each tier

- **Hacky demo:** free shared database (512 MB, no SLA), one box, and no US-only guarantee on AI calls. Fine for pitches and hackathons, not for agency data.
- **Cheap pilot:** US-routed AI and a real database, but one box is a single point of failure. Good enough for a tabletop exercise.
- **Pilot on Fargate:** restarts itself, no operating system to patch, still one availability zone. The first tier you can put in a security questionnaire with a straight face.
- **Production:** keeps running if an AWS data center goes down. This is the version you sell to a state.

## Moving to GovCloud

The production tier lands at roughly $265–295 a month in GovCloud. AWS doesn't publish a single markup; analyst estimates put GovCloud 10–30% above commercial regions. Three more changes:

- Atlas for Government is priced by quote, so the $57 database line will change.
- Cognito's free tier doesn't apply in GovCloud.
- OpenRouter sits outside the GovCloud boundary. An agency that requires everything inside it would need the model served from Bedrock in GovCloud instead.

## Not counted here

- The one-time cost of a GovRAMP or FedRAMP assessment. This will likely dwarf the monthly hosting bill.
- Domain, email, SMS alerts, voice, and staff time.

Sources: [Fargate rates](https://aws.amazon.com/fargate/pricing/), [ALB and NAT rates](https://www.opslyft.com/blog/aws-load-balancer-pricing), [NAT and Secrets Manager](https://computingforgeeks.com/aws-costs-explained-real-numbers/), [Atlas tiers](https://managed-db-pricing.pages.dev/blog/mongodb-atlas-pricing-explained/), [Lightsail](https://www.vpsbenchmarks.com/hosters/amazon_lightsail/plans/1155), [DeepSeek V3.2 on OpenRouter](https://computeprices.com/providers/openrouter/models/deepseek-v3-2), [OpenRouter US routing](https://aireiter.com/blog/openrouter-us-in-region-routing-guide), [Cognito](https://aws.amazon.com/cognito/pricing), [ArcGIS Location Platform](https://www.esri.com/arcgis-blog/products/platform/announcements/basemap-sessions), [GovCloud premium](https://atonementlicensing.com/blog/aws-govcloud-pricing/)

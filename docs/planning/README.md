# Planning: the government-ready DisasterDeck

As of 2026-11-17. Owner: Dan Vu.

This folder turns the Hack the Nest prototype into something a government agency can actually buy: a compliant stack, a market read, costs, funding, and the next steps. Every stack call is made. What's left is real-world work: the team conversation, the AWS account, and the IU pilot.

| Note | What it covers |
|---|---|
| [Blocked on a person](human-blocked.md) | Every human action item in one checklist |
| [Desk](desk.md) | Approved calls, open decisions, what's blocked on a person, funding order, research queue, decision log |
| [Stack review](stack-review.md) | Each layer of the repo, the government-compliant options, and what we picked |
| [Market](market.md) | What state emergency agencies already buy, and where the gap is |
| [Costs](costs.md) | Monthly cost from a hacky demo up to multi-zone production |
| [AWS setup](aws-setup.md) | Opening the account, step by step |
| [Funding](funding.md) | DHS S&T and FEMA programs (NSF track is in the Desk) |

The live version of these notes is the DisasterDeck HQ doc. This folder is a snapshot of it.

## The short version

- **Product:** open source under AGPL (pending team agreement). Anyone can run it; we sell hosting, setup, training and support.
- **Stack:** USWDS frontend, AWS (Fargate, us-east-2), MongoDB Atlas, gpt-oss-120b through OpenRouter's US-only endpoint, MapLibre with Esri basemaps, Cognito for staff, every login optional.
- **First pilot:** a tabletop exercise with IU Emergency Management. It uses no real data, so it needs no compliance paperwork.
- **Funding order:** NSF I-Corps → NSF PESOSE → NSF STTR. DHS S&T's Long Range BAA is open now as a parallel track.

Compliance status changes often. Check the FedRAMP Marketplace and the GovRAMP Authorized Product List before you put any claim from this folder into a pitch or proposal.

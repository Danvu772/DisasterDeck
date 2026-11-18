# Blocked on a person

Every action item that needs Dan (or another human): a conversation, an account, a signature, or a judgment call. Gathered from the Desk, the funding notes, the AWS guide and the planning chat. Tick items here or in the DisasterDeck HQ doc.

## Now

- [ ] **Install the Claude GitHub App on `Danvu772/disasterdeck`** ([github.com/apps/claude](https://github.com/apps/claude/installations/select_target)) so planning updates can be pushed and PRs opened.
- [ ] **Settle code ownership with the team.** The repo has no license and Darshal, Ömer and the others all wrote parts of it. Get written agreement to publish under AGPL before building a company on it.
- [ ] **Talk to Ömer.** Cofounders: Dan as operator, Ömer as visionary (it was Ömer's idea). Cover roles, the AGPL license and ownership in one conversation.
- [ ] **Rotate every hackathon secret.** Create Dan's own Atlas cluster (Darshal owns the old one); issue fresh OpenRouter, NASA and other keys; don't carry over Anthropic, SSOJet or old ElevenLabs keys; retire Vultr.
- [ ] **Find out who controls `disasterdeck.us`.**
- [ ] **Open the AWS account** (`us-east-2`, root MFA, Identity Center admin, budget alarms, CloudTrail). Guide: [AWS setup](aws-setup.md).
- [ ] **Install the AWS Agent Toolkit for Claude Code on your Mac** (region `us-east-2`, the new AWS experience), following [aws/agent-toolkit-for-aws setup](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md). It has to run on your machine, not in a cloud session.
- [ ] **Rename the HQ doc** to "DisasterDeck HQ" in the browser (the rename didn't take from the API).

## After the Ömer conversation

- [ ] **Trademark "DisasterDeck."** Around $350 per class; run it past IU tech transfer or a startup lawyer first.
- [ ] **Set up the official GitHub organization** with a CLA, an AUTHORS file and a short governance doc naming the founders.
- [ ] **Publish the repo under AGPL** once the team agrees (also step one for PESOSE).
- [ ] **Get IU's written OK that DisasterDeck isn't IU property** (IU innovation and commercialization office). Until then, keep it off IU laptops, servers and lab hours.

## Pilot

- [ ] **Book the IU Emergency Management tabletop exercise.** No real data, so no compliance paperwork.
- [ ] **Ask IU IT security what they need** before the tabletop (research item 5 will prep this).

## Funding

- [ ] **Email IU tech transfer:** next regional I-Corps cohort, and who can be faculty lead.
- [ ] **Spring 2027:** submit the NSF STTR Project Pitch (about three pages) so the invite lands before the Jul 7, 2027 deadline.
- [ ] **PESOSE Phase I:** next deadline Mar 2, 2027; realistically the following round, after the repo is public with real users.
- [ ] **After the tabletop:** request an S&T program manager call through the DHS LRBAA portal (oip.dhs.gov/baa). Bring the results.
- [ ] **Spring 2027:** check the DHS SBIR pre-solicitation for FEMA topics.
- [ ] **Ask the IU contact** whether IU Emergency Management partners with Indiana DHS on FEMA grants.
- [ ] **Apply for AWS Activate Founders** once `disasterdeck.us` has a real landing page.

## Security rules (standing)

- Never send passwords, access keys or the root email password to anyone, including Claude.
- No access keys for root or the admin user. Secrets go in AWS Secrets Manager, never in `.env`, Slack or chat.
- Never commit anything from `~/.aws/` or any `.env` file.

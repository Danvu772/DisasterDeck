# Government-compliant stack review

Nov 17, 2026 · Dan Vu

A review of every layer of this repo, looking at what agencies can buy. Each layer lists what the hackathon build uses today, the government-compliant options with pros and cons, and the decision. Compliance status changes often, so confirm it on the FedRAMP Marketplace and the GovRAMP Authorized Product List before a pitch or proposal.

## Locked decisions

- **Frontend design system: USWDS** (U.S. Web Design System). It replaces shadcn/Radix and the motion/liquid-goo effects.
- **Hosting: AWS** (moving to GovCloud later). It replaces the Vultr VM.

## How compliance works for us

- **Building on authorized services doesn't make DisasterDeck authorized.** Every vendor below holds its own authorization. DisasterDeck will eventually need its own: GovRAMP for state agencies, FedRAMP if a federal agency buys it. Building on authorized services means inheriting most of the controls, so our own package is far smaller.
- **GovRAMP is StateRAMP's new name** (renamed February 2025). It's the state and local equivalent of FedRAMP and is built on NIST 800-53. AWS GovCloud is on the GovRAMP authorized list through its federal authorization.
- **FedRAMP renamed its levels in 2026.** Under the 2026 Consolidated Rules (CR26), High is now called Class D. Adoption is mandatory from Jan 1, 2027. Older marketing still says High, Moderate and Low.
- **Rule of thumb for every vendor:** if it has no FedRAMP or GovRAMP listing, it either runs inside our own AWS boundary or gets an adapter so we can swap it out. If it can't do either, it's demo-only.

## Layer by layer

### 1. Hosting and compute

**Today:** a single Vultr VM (IPv6-only), systemd services, Cloudflare WARP for IPv4, Tailscale for access.

| Option | Pros | Cons |
| --- | --- | --- |
| **AWS GovCloud (US)** | FedRAMP High (Class D); on GovRAMP's list; the default answer for agencies; Bedrock, Transcribe and Polly all run in the same boundary | Account requires US-person vetting; costs more; some services launch here later than in commercial AWS |
| AWS commercial (us-east/west) | FedRAMP Moderate; easy to start; every service available | Not enough for High workloads; we'd have to migrate again |
| Azure Government | FedRAMP High; strong if an agency is a Microsoft shop | Different stack from the one the team knows |

**Decided:** ECS Fargate across availability zones in `us-east-2`, with everything in infrastructure-as-code (CDK or Terraform) so it moves to GovCloud with no code changes. See [AWS setup](aws-setup.md).

### 2. Deploy, CI and admin access

**Today:** GitHub Actions builds the app, joins a Tailscale tailnet with an ephemeral key, and rsyncs to the VM. Secrets live in `/etc/desk/env.local` on the box.

| Option | Pros | Cons |
| --- | --- | --- |
| **GitHub Actions → AWS via OIDC** (no long-lived keys) | Keeps the existing workflow; no static AWS credentials | GitHub Enterprise Cloud holds FedRAMP Tailored (LI-SaaS) and is still pursuing Moderate |
| AWS CodePipeline/CodeBuild | Inside the GovCloud boundary | Clunkier; the team would have to relearn CI |
| **AWS Secrets Manager** for env | Encrypted and audited; rotates secrets | Small cost |
| **SSM Session Manager** instead of Tailscale or SSH | Every admin session logged; no open ports | Mostly moot on Fargate |

**Recommendation:** keep GitHub Actions but authenticate to AWS with OIDC. Move every secret into Secrets Manager. Delete the Tailscale, WARP and Vultr scripts.

### 3. Frontend and UI (locked: USWDS)

**Today:** Next.js 15, React 19, Tailwind 4, shadcn/Radix, motion, liquid-goo.

| Option | Pros | Cons |
| --- | --- | --- |
| **USWDS + react-uswds (Trussworks)** | Federal standard; components designed for Section 508 and WCAG; lightweight and mobile-first; free | Rebuilding every component; visually conservative unless themed with design tokens |
| Keep shadcn and audit it for 508 | No rewrite | We own the accessibility proof; looks like a startup, not a government tool |

**Recommendation:** USWDS. Keep Next.js and React. Remove motion and liquid-goo from production; they can stay behind the demo-mode flag. Run an automated accessibility check (axe) in CI.

### 4. AI models

**Today:** Claude through the Anthropic API directly, with models picked per task in `agents/shared/llm.ts`. An OpenAI key is in `.env.example`.

| Option | Pros | Cons |
| --- | --- | --- |
| Claude on Amazon Bedrock in GovCloud | FedRAMP High and DoD IL4/5; inside our boundary | Not the chosen direction |
| Claude on Google Vertex AI | FedRAMP High | Pulls in a second cloud |
| Anthropic API directly | Newest features first | Data leaves our boundary; agencies will ask |
| **Open-weight model via OpenRouter US in-region routing** | Cheap; US-only routing on the Business plan; swap models freely | OpenRouter is outside the GovCloud boundary |

**Decided:** no Claude, no DeepSeek. Model calls go through OpenRouter's US-only endpoint (`us.openrouter.ai`, Business plan, 8% fee) behind the existing `modelFor()` adapter. Model: **gpt-oss-120b** (about $0.04 in / $0.17 out per million tokens), with gpt-oss-20b for small tasks. The same open model also runs on Bedrock, which is the fallback if an agency requires everything inside AWS. Drop the Anthropic and OpenAI keys.

### 5. Database

**Today:** MongoDB Atlas (commercial), `mongodb` driver, on Darshal's cluster.

| Option | Pros | Cons |
| --- | --- | --- |
| **MongoDB Atlas for Government** | FedRAMP Moderate; runs on AWS GovCloud; zero code change; vector search and Queryable Encryption | MongoDB announced it is pursuing High (June 2025), so confirm current status; an extra vendor contract |
| Amazon DocumentDB | Native to GovCloud, in AWS's FedRAMP scope; mostly Mongo-compatible | Not fully compatible, so test the queries and indexes; weaker search features |
| RDS Postgres + PostGIS | The most boring and trusted option; strongest geospatial support | Full data-layer rewrite |

**Decided:** keep MongoDB on Atlas, under a new cluster Dan owns (Atlas for Government when an agency needs it). Keep a thin repository layer so DocumentDB stays a fallback.

### 6. Login (two different user groups)

**Today:** Auth.js (`next-auth` 5 beta) with SSOJet over OIDC, and roles mapped from email through an env var.

**Agency staff and volunteers:**

| Option | Pros | Cons |
| --- | --- | --- |
| **Agency's own IdP (Entra ID or Okta) over SAML/OIDC** | Staff use the logins they already have; the agency controls offboarding; nothing for us to certify | Needs a federation layer |
| **Amazon Cognito** as that layer | Inside the AWS boundary; handles SAML and OIDC federation and MFA | Clunky developer experience |
| SSOJet | Already wired up | Small startup; no FedRAMP or GovRAMP listing found; hard to defend in procurement |

**Members of the public:**

| Option | Pros | Cons |
| --- | --- | --- |
| **Login.gov** | Run by GSA; open to state and local governments; ~100M accounts | Requires a partner agreement; adds friction for someone filing an urgent report |
| No login for urgent reports | Fastest in a disaster | Abuse and spam, which needs rate limits and moderation |

**Decided:** SSOJet is out. Every login is optional and emergency reports need none. Staff log in through Cognito federated to their agency's Entra ID or Okta; the public can optionally use Login.gov. Keep Auth.js, pin it to a stable release, and move roles out of env vars into the database.

### 7. Voice (speech-to-text and text-to-speech)

**Today:** ElevenLabs speech-to-text and text-to-speech; the browser's Web Speech API on the field phone.

| Option | Pros | Cons |
| --- | --- | --- |
| **Amazon Transcribe + Polly** | Inside our boundary; FedRAMP High scope in GovCloud | Voices less natural; fewer languages than ElevenLabs |
| ElevenLabs for Government | Best voice quality; FedRAMP 20x Class A (Oct 2026) | Class A is the entry tier; certification applies only in Zero Retention Mode with US data residency; outside our AWS boundary |
| Browser Web Speech API | Free; no setup | **Compliance flag:** Chrome sends audio to Google's servers by default |

**Decided:** Transcribe and Polly are the default, behind a provider adapter, with ElevenLabs (Zero Retention Mode) as an upgrade an agency can approve. Check language coverage once the pilot is picked. **Field dictation:** the README's "no audio leaves the phone" claim is wrong for default Chrome. Use `processLocally: true` for on-device recognition only, with typing as the fallback where it isn't supported. Never Google's cloud path.

### 8. Maps

**Today:** MapLibre GL with Leaflet; Mapbox basemaps when a token is set, otherwise Esri gray.

| Option | Pros | Cons |
| --- | --- | --- |
| **MapLibre + Esri/ArcGIS basemaps and services** | ArcGIS Online is FedRAMP Moderate; emergency management agencies already run ArcGIS, so we can read their layers directly | Esri licensing costs; learning curve |
| Self-hosted tiles (Protomaps/OSM on S3) | Inside our boundary; works when vendors are down; can be cached offline | We maintain the tiles |
| Mapbox | Prettiest; already wired | No government authorization verified |

**Decided:** MapLibre as the only renderer, with Esri basemaps (US-hosted, FedRAMP Moderate) and our own OSM tiles on AWS as the fallback. Drop Mapbox and Leaflet.

### 9. Data feeds

**Today:** USGS quake feeds, NASA data (API key), HOT/OSM buildings, X posts (archived replay), Exa news search, Google Sheets for the volunteer shelter sheet.

| Source | Verdict |
| --- | --- |
| **USGS, NASA, NOAA/NWS, FEMA OpenFEMA** | Keep and expand. Public government data with no compliance risk |
| **HOT/OSM** | Keep. Open data; track attribution |
| X (social posts) | Optional feed only. Government monitoring of social media raises privacy and civil liberties questions, so the agency needs a written policy and we mask personal data (started in `privacy.ts`) |
| Exa | Optional add-on only. Treat as outside the boundary until checked |
| Google Sheets | An integration, not a dependency. Many agencies and volunteer groups live in Sheets |

### 10. Alerts and messaging

**Today:** none in production.

| Option | Pros | Cons |
| --- | --- | --- |
| **AWS End User Messaging (Pinpoint) / SNS** | In AWS's FedRAMP scope; SMS fallback when data networks fail | 10DLC and short-code registration takes weeks |
| **FEMA IPAWS** | The official channel for public emergency alerts | Formal FEMA application and an agreement with an alerting authority; a roadmap item, not MVP |
| Twilio | Easy | Another vendor to justify; status not checked |

### 11. Observability and audit

**Today:** custom health scripts.

**Recommendation:** CloudTrail (every API action), CloudWatch logs and alarms, and an app-level audit log in the database recording who changed which case and when. Agencies will ask for all of this on day one.

## Red flags in the repo

- `DEMO_MODE=1` allows `?user=ID` with no login. Make it impossible to enable in production builds, not just off by an env var.
- Secrets in a flat env file on a VM. Move them to Secrets Manager.
- The README says Web Speech audio stays on the phone. It doesn't by default in Chrome (see Voice).
- The single VM is one point of failure in a product meant for disasters. Use Fargate across availability zones.
- SSOJet project config is wired into `auth.ts`. Replace it with Cognito.
- No LICENSE file. See the ownership items in the [Desk](desk.md).

## Migration order

1. Infrastructure-as-code on commercial AWS (`us-east-2`): VPC, Fargate, Secrets Manager, CloudTrail. Retire Vultr.
2. Point `llm.ts` at OpenRouter's US endpoint with gpt-oss-120b.
3. Cognito in place of SSOJet; roles move into the database.
4. New Atlas cluster owned by Dan; Atlas for Government (or DocumentDB) cutover when an agency needs it.
5. USWDS frontend rebuild, screen by screen.
6. Voice adapter with Transcribe and Polly; on-device field dictation.
7. Self-hosted tiles and ArcGIS layer import.
8. Apply for a GovCloud account; redeploy the same infrastructure there.
9. SOC 2 readiness, then GovRAMP once a pilot agency sponsors it.

## Verify before pitching

- Current FedRAMP status of Atlas for Government (Moderate confirmed; High was in progress).
- Whether Mapbox, Exa, Tailscale and Twilio have any government listing.
- Whether the target state requires GovRAMP or runs its own program.

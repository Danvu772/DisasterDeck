# DisasterDeck AWS runtime (infra)

Self-contained CDK (TypeScript) package. Everything lives here; it never touches the repo root `package.json`. Synthesizes without AWS credentials (no VPC lookups, no SDK calls).

Stands up, in one stack:

- A new VPC across two AZs (public tier for the ALB, private tier for Fargate, one NAT gateway).
- ECS Fargate: a `next start` web service behind an internet-facing ALB, and a separate single-task `npm run brain` worker service.
- Both secrets (`disasterdeck/mongo/uri` -> `MONGODB_URI`, `disasterdeck/openrouter/api-key` -> `OPENROUTER_API_KEY`) injected from Secrets Manager into the task env. No env files on hosts.
- CloudTrail (multi-region, management events) on.
- CloudWatch log groups for web, brain, and the health poller.
- Two CloudWatch alarms: Brain loop stall and 5xx rate.

Synth: `cdk synth` (run from inside `infra/`). Deploy is issue #7.

## VPC choice

A new two-AZ VPC, not the default VPC (`vpc-0842df58a511dbd1d`). The default VPC only has public subnets, so Fargate tasks would need public IPs and there's no NAT tier for the Brain's controlled egress. A VPC defined in the stack is also what makes the issue's "redeploy to GovCloud with no code change" real: it imports nothing account-specific, and the secrets are referenced by partial ARN built from pseudo-params, so the whole template boots in another partition unchanged. Cost of the choice: one NAT gateway (~$32/mo) and the fact that a single NAT is a combined egress point for both AZs (fine at this scale).

## ECS / service config

Two Fargate services off one cluster and one ECR repo (`disasterdeck`, tag `latest`; the image is built and pushed by #7). Web: `npm run start` on :3000, 512 CPU / 1024 MiB, two tasks (one per AZ, so stopping one keeps `/login` answering), behind an HTTP-only ALB (HTTPS + cert + `AUTH_URL` are #7/#12). Brain: single task, `npx tsx workers/brain.ts`, 256 CPU / 512 MiB, no ALB, no ingress SG. The command is not literally `npm run brain` because that script is `tsx --env-file=.env.local ...` and the `--env-file` flag errors on a host with no env file; running the worker entry directly lets ECS put `MONGODB_URI` into `process.env` instead. Both services read the two secrets as plain-string values (each Secret Manager entry is assumed to hold its value directly, not JSON).

## Alarms

- **BrainLoopStall** — a per-minute Lambda polls `http://<alb>/api/health` and logs `brainLoopAgeSeconds` (age of `lastLoopAt`, or a 86400 sentinel when the loop can't be confirmed); a metric filter turns that into `DisasterDeck/BrainLoopAgeSeconds`. Alarm: `>= 120` seconds, 2 of 2 one-minute datapoints, `treatMissingData: BREACHING`. 120s because the Brain stamps `lastLoopAt` every ~1s; two datapoints to skip transients; BREACHING so a dead poller also alerts rather than reading as healthy.
- **Server5xxRate** — ALB metric math `IF(req > 50, fivexx / req * 100, 0)` over `HTTPCode_Target_5XX_Count` / `RequestCount`. Alarm: `>= 5` (%), 2 of 2 one-minute datapoints, `treatMissingData: NOT_BREACHING`. Target (not ELB) 5xx isolates app errors; the `req > 50` guard suppresses divide-by-zero and low-traffic noise.

## Left for #7 / #12

- Container image build + push (no Dockerfile exists yet).
- HTTPS listener, ACM cert, DNS, and `AUTH_URL`.
- Remaining app secrets in Secrets Manager (`AUTH_SECRET`, `SSOJET_*`, `ELEVENLABS_API_KEY`); `ANTHROPIC_API_KEY` is dropped by #9's OpenRouter switch. `OPENROUTER_API_KEY` is wired ahead of #9.
- OIDC trust in GitHub Actions, and the actual `--region us-east-2` deploy.
- Task CPU/memory are placeholder starting points; tune after the first real run.
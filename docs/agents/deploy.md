# Deployment

Production runs on ECS Fargate. A **version tag** on `main` deploys. Push a tag to release what is
on `main`:

```sh
git tag -a v1.2.3 -m "release v1.2.3"
git push origin v1.2.3
gh run watch                     # follow the Deploy run
```

Tag only when the person asks. A Deploy run builds the image, pushes it to ECR, rolls out the web
and Brain services and waits for stability. About 10 minutes.

## How it fits together

| Piece | What it is |
|---|---|
| `.github/workflows/deploy.yml` | Runs on `v*` tags. Authenticates to AWS with GitHub OIDC (no keys), builds the Docker image, pushes it to the ECR repo the stack defines, then `update-service --force-new-deployment` on both services and `wait services-stable`. |
| `infra/lib/disasterdeck-stack.ts` | The CDK stack (D-0002). Defines the ECR repo, the OIDC provider and deploy role, the two Fargate services (web + Brain), the ALB and CloudTrail. |
| `Dockerfile` | One image, two commands: `npm run start` (web) and `npx tsx workers/brain.ts` (Brain). |
| AWS | ECS Fargate across two AZs, private tasks behind an internet-facing ALB. |

### Rollback

The web service's ALB health check is `/login`, and the service has ECS's deployment circuit
breaker on with rollback. A release whose `/login` never answers 200 is rolled back to the previous
revision automatically, and the workflow's `wait services-stable` then fails the run. The Brain
rolls back on task-start failure the same way.

## Secrets

No secrets live in the repo or in GitHub. The deploy role is assumed via OIDC from `vars`, and every
runtime secret (`MONGODB_URI`, `OPENROUTER_API_KEY`, `AUTH_SECRET`) is injected into the task by ECS
from AWS Secrets Manager. The build uses a placeholder `AUTH_SECRET` (as `ci.yml` does); the real one
arrives at run time.

GitHub Actions `vars` the orchestrator set once after `cdk deploy` (these are not secrets):

- `AWS_DEPLOY_ROLE_ARN` — the OIDC-trusted deploy role ARN.
- `AWS_REGION` — e.g. `us-east-2`.
- `AWS_STACK_NAME` — e.g. `DisasterDeckStack`.

The UX ("runtime env.file") concept that Vultr used (`/etc/desk/env.local`, `npm run env:push`) is
gone. Server values live in Secrets Manager.

## Rules for agents

- Do not push a tag unless the person asks.
- One Brain per database. The Brain Fargate service runs it; never start a laptop Brain against the
  shared Atlas cluster or the service's task waits on the lease and the board stops moving.
- `?user=` demo identity must stay refused in production: `DEMO_MODE=0` and the middleware in
  `lib/localDemo.ts` refuse it. A production build cannot enable it.
- A new `NEXT_PUBLIC_*` variable must be passed at image-build time (a `docker build` arg) and, if
  secret, moved into Secrets Manager rather than a container env.
- Production runs with `DEMO_MODE=0`. Keep it that way.

## Debugging

```sh
gh run list --workflow deploy.yml                # which run failed, and at which step
aws cloudformation describe-stacks --stack-name DisasterDeckStack   # outputs: repo, cluster, service names
aws ecs describe-services --cluster <cluster> --services <web> <brain>
aws ecs list-tasks --cluster <cluster> --service-name <web>
aws logs tail /aws/ecs/web --follow             # the web service's logs
```

The Brain loop stall and 5xx alarms (`infra/lib/disasterdeck-stack.ts`) fire into CloudWatch; check
those before assuming the deploy itself broke something.
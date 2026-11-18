# Deployment

Production runs on ECS Fargate. A **version tag** on `main` deploys. Push a tag to release what is
on `main`:

```sh
git tag -a v1.2.3 -m "release v1.2.3"
git push origin v1.2.3
gh run watch                     # follow the Deploy run
```

Tag only when the person asks, and only a commit that is on `main`: the first step after checkout
fails the run unless `git merge-base --is-ancestor $GITHUB_SHA origin/main` passes. A Deploy run
builds the image, pushes it to ECR tagged with the commit SHA (and `latest`, which nothing deploys),
registers a new task definition revision for web and for the Brain pointing at the SHA image, updates
each service to it and waits for stability. About 10 minutes.

## How it fits together

| Piece | What it is |
|---|---|
| `.github/workflows/deploy.yml` | Runs on `v*` tags. Authenticates to AWS with GitHub OIDC (no keys), builds the Docker image, pushes it to the ECR repo the stack defines, then renders and registers a NEW task definition revision per service (`amazon-ecs-render-task-definition` + `amazon-ecs-deploy-task-definition`, image `<repo>:<sha>`) and waits for each service to be stable. |
| `infra/lib/disasterdeck-stack.ts` | The CDK stack (D-0002). Defines the ECR repo, the OIDC provider and deploy role, the two Fargate services (web + Brain), the ALB and CloudTrail. |
| `Dockerfile` | One image, two commands: `npm run start` (web) and `npx tsx workers/brain.ts` (Brain). |
| AWS | ECS Fargate across two AZs, private tasks behind an internet-facing ALB. |

### Rollback

Every release is a new task definition revision whose image is `<repo>:<commit sha>`. The web
service's ALB health check is `/login`, and both services have ECS's deployment circuit breaker on
with rollback. A release whose `/login` never answers 200 (or whose Brain tasks never start) rolls
back to the previous revision, which points at the previous SHA image, and the workflow's stability
wait then fails the run. To roll back by hand, point the service at an earlier revision:

```sh
aws ecs update-service --cluster <cluster> --service <web|brain> --task-definition <family>:<revision>
```

`latest` is pushed as a convenience tag only. No task definition references it, so a rollback never
pulls a newer image.

### CDK and the workflow both touch task definitions

CDK owns the first task definitions (family, roles, env, secrets, log config). It points them at an
immutable tag, `bootstrap` by default, never `latest`: `cdk deploy -c imageTag=<sha>`. After that the
workflow owns the image. Each run reads the service's current task definition, swaps only the image
for `<repo>:<sha>`, registers it as a new revision and updates the service. Env, secrets and roles
carry over from whatever CDK last wrote.

The hazard: a `cdk deploy` that changes a task definition makes CloudFormation register a revision
with CDK's tag and move the service to it. Run those with `-c imageTag=<sha currently live>` (the
image in the service's active task definition), or the service drops back to `bootstrap`. A
`cdk deploy` that leaves the task definitions alone does not touch the running revision. First
install: the `bootstrap` image does not exist yet, so deploy the stack, push the first tag, and the
workflow's revision brings the services up. The deploy role may register revisions and pass only the
execution and task roles to ECS tasks (`iam:PassRole`), nothing broader.

## Secrets

No secrets live in the repo or in GitHub. The deploy role is assumed via OIDC from `vars`, and every
runtime secret is injected into the task by ECS from AWS Secrets Manager: the web task gets
`MONGODB_URI`, `OPENROUTER_API_KEY`, `AUTH_SECRET`, `SSOJET_CLIENT_ID`, `SSOJET_CLIENT_SECRET` and
`SSOJET_ISSUER_URL`, the Brain gets the first two. The Secrets Manager names are
`disasterdeck/mongo/uri`, `disasterdeck/openrouter/api-key`, `disasterdeck/auth/secret`,
`disasterdeck/ssojet/client-id`, `disasterdeck/ssojet/client-secret` and `disasterdeck/ssojet/issuer-url`,
and they must exist before `cdk deploy`. The image never contains `AUTH_SECRET`: `next build` gets a
placeholder set inline on that one `RUN`, not an `ENV`. `npm run check:deploy` fails if any of this regresses.

GitHub Actions `vars` the orchestrator set once after `cdk deploy` (these are not secrets):

- `AWS_DEPLOY_ROLE_ARN`: the OIDC-trusted deploy role ARN.
- `AWS_REGION`: e.g. `us-east-2`.
- `AWS_STACK_NAME`: e.g. `DisasterDeckStack`.

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
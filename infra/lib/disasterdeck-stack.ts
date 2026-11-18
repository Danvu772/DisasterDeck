// DisasterDeck AWS runtime, one stack. Synthesizes without AWS credentials:
// no `fromLookup`, no SDK calls; secrets are referenced by partial ARN and
// resolved from pseudo-params (partition/region/account) so the same template
// redeploys to GovCloud unchanged.
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

const IMAGE_TAG = "latest";
const MONGO_DB = "disaster_desk";
// Docs/agents/deploy.md: prod data lives under malatya-2023. Override at deploy.
const DESK_ID = process.env.DESK_ID ?? "malatya-2023";

// The Brain stamps lastLoopAt every ~1s (lib/db.ts markLoop). Two minutes of
// silence means the loop is down.
const STALL_SECONDS = 120;
// 5% of requests returning target 5xx over two minutes is a real outage signal.
const FIVEXX_PERCENT = 5;

// 86400s sentinel logged by the poller when it cannot confirm a fresh loop
// (fetch failed, non-object body, or null lastLoopAt). It forces the stall
// alarm to fire rather than letting an unreachable health endpoint read as "ok".
const POLLER_CODE = `
const STALL_SENTINEL = ${STALL_SECONDS * 720};
exports.handler = async () => {
  const out = { brainLoopAgeSeconds: STALL_SENTINEL };
  try {
    const res = await fetch(process.env.HEALTH_URL, {
      headers: { "cache-control": "no-store" },
      signal: AbortSignal.timeout(5000),
    });
    let body;
    try { body = await res.json(); } catch (_) { /* non-JSON -> sentinel below */ }
    const last = body && body.lastLoopAt;
    if (last) {
      const t = Date.parse(last);
      if (!Number.isNaN(t)) {
        out.brainLoopAgeSeconds = Math.max(0, Math.round((Date.now() - t) / 1000));
      }
    }
    out.httpStatus = res.status;
    out.pending = body && typeof body.pending === "number" ? body.pending : -1;
  } catch (e) {
    out.error = e && e.message ? e.message : String(e);
  }
  console.log(JSON.stringify(out));
};
`;

export class DisasterDeckStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ----- VPC: two AZs, one public tier (ALB) + one private tier (Fargate) -----
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // ----- Secrets: referenced by partial ARN, never read or logged -----
    const mongoUri = secretsmanager.Secret.fromSecretPartialArn(
      this,
      "MongoUri",
      `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:disasterdeck/mongo/uri`,
    );
    const openRouterKey = secretsmanager.Secret.fromSecretPartialArn(
      this,
      "OpenRouterApiKey",
      `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:disasterdeck/openrouter/api-key`,
    );

    // Web-only secrets: Auth.js session secret and the SSOJet OIDC client. The Brain never reads them.
    const secretArn = (name: string) =>
      `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:${name}`;
    const authSecret = secretsmanager.Secret.fromSecretPartialArn(this, "AuthSecret", secretArn("disasterdeck/auth/secret"));
    const ssojetClientId = secretsmanager.Secret.fromSecretPartialArn(this, "SsojetClientId", secretArn("disasterdeck/ssojet/client-id"));
    const ssojetClientSecret = secretsmanager.Secret.fromSecretPartialArn(this, "SsojetClientSecret", secretArn("disasterdeck/ssojet/client-secret"));
    const ssojetIssuerUrl = secretsmanager.Secret.fromSecretPartialArn(this, "SsojetIssuerUrl", secretArn("disasterdeck/ssojet/issuer-url"));

    // ----- Container image (built and pushed by #7's GitHub Actions) -----
    const repo = new ecr.Repository(this, "Repo", {
      repositoryName: "disasterdeck",
      imageScanOnPush: true,
    });

    // ----- GitHub OIDC: no long-lived AWS keys (D-0015 / CD-1) -----
    // The deploy workflow authenticates by asking GitHub's Actions IdP for a web-identity token,
    // then AssumeRoleWithWebIdentity into this role. Trust is scoped to version tags of this repo
    // only, so a tag push from any other repo (or an untagged ref) cannot assume it.
    const githubOidc = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
      thumbprints: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
    });
    const deployRole = new iam.Role(this, "DeployRole", {
      roleName: "disasterdeck-deploy",
      assumedBy: new iam.FederatedPrincipal(
        githubOidc.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": "repo:Danvu772/DisasterDeck:ref:refs/tags/*",
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
    });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    // One shared execution role (pulls the ECR image, reads the runtime secrets).
    const executionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    mongoUri.grantRead(executionRole);
    openRouterKey.grantRead(executionRole);
    for (const s of [authSecret, ssojetClientId, ssojetClientSecret, ssojetIssuerUrl]) s.grantRead(executionRole);

    const webLogs = new logs.LogGroup(this, "WebLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
    });
    const brainLogs = new logs.LogGroup(this, "BrainLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    // ----- Web task: `next start` on :3000 -----
    const webTask = new ecs.FargateTaskDefinition(this, "WebTask", {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
    });
    const webContainer = webTask.addContainer("web", {
      image: ecs.ContainerImage.fromEcrRepository(repo, IMAGE_TAG),
      command: ["npm", "run", "start"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "web", logGroup: webLogs }),
      portMappings: [{ containerPort: 3000 }],
      environment: { MONGODB_DB: MONGO_DB, DESK_ID, DEMO_MODE: "0", NODE_ENV: "production" },
    });
    webContainer.addSecret("MONGODB_URI", ecs.Secret.fromSecretsManager(mongoUri));
    webContainer.addSecret("OPENROUTER_API_KEY", ecs.Secret.fromSecretsManager(openRouterKey));
    webContainer.addSecret("AUTH_SECRET", ecs.Secret.fromSecretsManager(authSecret));
    webContainer.addSecret("SSOJET_CLIENT_ID", ecs.Secret.fromSecretsManager(ssojetClientId));
    webContainer.addSecret("SSOJET_CLIENT_SECRET", ecs.Secret.fromSecretsManager(ssojetClientSecret));
    webContainer.addSecret("SSOJET_ISSUER_URL", ecs.Secret.fromSecretsManager(ssojetIssuerUrl));

    const webSg = new ec2.SecurityGroup(this, "WebSg", {
      vpc,
      allowAllOutbound: true,
      description: "Web Fargate tasks",
    });
    const webService = new ecs.FargateService(this, "WebService", {
      cluster,
      taskDefinition: webTask,
      desiredCount: 2,
      assignPublicIp: false,
      securityGroups: [webSg],
      // A deploy whose tasks never pass the ALB health check on /login rolls back automatically:
      // ECS's circuit breaker stops the rollout and reverts to the previous, healthy revision
      // (CD-2). The workflow pushes a new image and waits for services-stable; it does not roll
      // back itself.
      circuitBreaker: { rollback: true },
    });

    // ----- Brain task: single worker, no ALB -----
    // `npm run brain` is `tsx --env-file=.env.local ...`; the --env-file flag
    // fails with no env file on the host, so run the worker entry directly and
    // let ECS inject MONGODB_URI into process.env.
    const brainTask = new ecs.FargateTaskDefinition(this, "BrainTask", {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
    });
    const brainContainer = brainTask.addContainer("brain", {
      image: ecs.ContainerImage.fromEcrRepository(repo, IMAGE_TAG),
      command: ["npx", "tsx", "workers/brain.ts"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "brain", logGroup: brainLogs }),
      environment: { MONGODB_DB: MONGO_DB, DESK_ID, DEMO_MODE: "0" },
    });
    brainContainer.addSecret("MONGODB_URI", ecs.Secret.fromSecretsManager(mongoUri));
    brainContainer.addSecret("OPENROUTER_API_KEY", ecs.Secret.fromSecretsManager(openRouterKey));

    const brainService = new ecs.FargateService(this, "BrainService", {
      cluster,
      taskDefinition: brainTask,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [new ec2.SecurityGroup(this, "BrainSg", { vpc, allowAllOutbound: true, description: "Brain worker" })],
      // Roll back a deploy whose tasks never reach RUNNING (no ALB here, so no /login signal;
      // the web service's circuit breaker does the health-check rollback).
      circuitBreaker: { rollback: true },
    });

    // ----- ALB (HTTP only; HTTPS + cert + AUTH_URL land in #7/#12) -----
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });
    const listener = alb.addListener("Http", { port: 80, open: true });
    listener.addTargets("Web", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService.loadBalancerTarget({ containerName: "web", containerPort: 3000 })],
      // The login page is the same signal the Vultr release used: 200 means the app answers.
      // The circuit breaker on WebService keys off this target group's health check.
      healthCheck: { path: "/login", interval: Duration.seconds(30) },
    });

    // ----- Deploy role permissions: push the image and roll out both services -----
    repo.grantPullPush(deployRole);
    // Read-only describes stay on *. The write (UpdateService) is pinned to the two services, and
    // ListTasks/DescribeTasks to this cluster.
    deployRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks", "ecs:DescribeServices", "ecs:DescribeClusters"],
        resources: ["*"],
      }),
    );
    deployRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:UpdateService"],
        resources: [webService.serviceArn, brainService.serviceArn],
      }),
    );
    deployRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:ListTasks", "ecs:DescribeTasks"],
        resources: ["*"],
        conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
      }),
    );

    // What the deploy workflow reads back from the stack: ECR repo to push, cluster and service
    // names to roll out. Exposed as outputs rather than hardcoded so the same workflow works in
    // any account (GovCloud included) without edits.
    new CfnOutput(this, "RepositoryUri", { value: repo.repositoryUri });
    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "WebServiceName", { value: webService.serviceName });
    new CfnOutput(this, "BrainServiceName", { value: brainService.serviceName });

    // ----- CloudTrail -----
    new cloudtrail.Trail(this, "Trail", {
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
    });

    // ----- Brain loop stall: poll /api/health, log the age, metric-filter it -----
    const pollerLogs = new logs.LogGroup(this, "HealthPollerLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
    });
    const healthPoller = new lambda.Function(this, "HealthPoller", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(POLLER_CODE),
      timeout: Duration.seconds(10),
      logGroup: pollerLogs,
      environment: { HEALTH_URL: `http://${alb.loadBalancerDnsName}/api/health` },
    });

    new logs.MetricFilter(this, "BrainLoopAgeFilter", {
      logGroup: pollerLogs,
      metricNamespace: "DisasterDeck",
      metricName: "BrainLoopAgeSeconds",
      filterPattern: logs.FilterPattern.exists("$.brainLoopAgeSeconds"),
      metricValue: "$.brainLoopAgeSeconds",
    });

    new events.Rule(this, "HealthPollSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(healthPoller)],
    });

    new cloudwatch.Alarm(this, "BrainLoopStall", {
      metric: new cloudwatch.Metric({
        namespace: "DisasterDeck",
        metricName: "BrainLoopAgeSeconds",
        statistic: cloudwatch.Stats.MAXIMUM,
        period: Duration.minutes(1),
      }),
      threshold: STALL_SECONDS,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: `Brain loop has not stamped lastLoopAt within ${STALL_SECONDS}s (or /api/health is unreachable)`,
    });

    // ----- 5xx rate on the ALB (target 5xx = app errors, not ELB-side) -----
    const fiveXx = new cloudwatch.Metric({
      namespace: "AWS/ApplicationELB",
      metricName: "HTTPCode_Target_5XX_Count",
      dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
      statistic: cloudwatch.Stats.SUM,
      period: Duration.minutes(1),
    });
    const requests = new cloudwatch.Metric({
      namespace: "AWS/ApplicationELB",
      metricName: "RequestCount",
      dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
      statistic: cloudwatch.Stats.SUM,
      period: Duration.minutes(1),
    });
    const fiveXxRate = new cloudwatch.MathExpression({
      expression: "IF(req > 50, fivexx / req * 100, 0)",
      usingMetrics: { fivexx: fiveXx, req: requests },
      period: Duration.minutes(1),
    });

    new cloudwatch.Alarm(this, "Server5xxRate", {
      metric: fiveXxRate,
      threshold: FIVEXX_PERCENT,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: `More than ${FIVEXX_PERCENT}% of ALB requests return target 5xx over 2 minutes`,
    });
  }
}
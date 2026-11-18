// CD-1 / CD-2 deploy-shape check. Runs in CI before anything touches AWS.
// It reads .github/workflows/deploy.yml, the Dockerfile and the synthesized CDK template and fails
// when the deploy path stops being "OIDC from a version tag, no long-lived keys, circuit-breaker
// rollback on both services, every runtime secret from Secrets Manager, an image that builds":
//
//   * workflow: the only trigger is `push: tags: ["v*"]`, it asks for id-token: write, assumes a
//     role, and has no AWS access key
//   * template: the OIDC trust subject is this repo and ends in ref:refs/tags/*; WebService and
//     BrainService both have DeploymentCircuitBreaker Enable+Rollback true; MONGODB_URI,
//     OPENROUTER_API_KEY, AUTH_SECRET and the SSOJET_* values are injected from Secrets Manager
//     (web gets all six, the Brain gets the first two) and never as plain environment
//   * Dockerfile: dev deps survive `npm ci` (tsx and typescript are needed), and no AUTH_SECRET
//     is baked into an ENV
//
// After the real audit it proves the audit can fail: it feeds one broken fixture per rule through
// the same function and asserts each is caught. The live half of CD-1/CD-2 (a real
// AssumeRoleWithWebIdentity, a real rollback after breaking /login) is proven at deploy time.
//
//   node scripts/check-deploy.mjs
//
// `cdk synth` runs inside infra/ and leaves a cdk.out behind; this removes it. Synth needs no AWS
// credentials.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const REPO = "repo:Danvu772/DisasterDeck";
const WEB_SECRETS = ["MONGODB_URI", "OPENROUTER_API_KEY", "AUTH_SECRET", "SSOJET_CLIENT_ID", "SSOJET_CLIENT_SECRET", "SSOJET_ISSUER_URL"];
const BRAIN_SECRETS = ["MONGODB_URI", "OPENROUTER_API_KEY"];

// A CFN value built from literals and {Ref} parts, flattened to one string: Refs become <Name>.
function cfn(v) {
  if (typeof v === "string") return v;
  if (v && v.Ref) return `<${v.Ref}>`;
  if (v && Array.isArray(v["Fn::Join"])) return v["Fn::Join"][1].map(cfn).join(v["Fn::Join"][0]);
  return `<${JSON.stringify(v)}>`;
}

export function audit({ workflow, dockerfile, template, allWorkflows = workflow }) {
  const errors = [];

  // --- workflow ---
  const lines = workflow.split("\n").map((l) => l.replace(/\s+#.*$/, "").replace(/^#.*$/, ""));
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  let block = "";
  if (start >= 0) {
    for (let i = start + 1; i < lines.length && (/^\s/.test(lines[i]) || lines[i] === ""); i++) block += lines[i] + "\n";
  }
  const flat = block.replace(/\s+/g, " ").trim();
  if (!/^push: tags: \[\s*["']v\*["']\s*\]$/.test(flat)) {
    errors.push(`deploy.yml trigger is not exactly \`push: tags: ["v*"]\` (got: ${flat || "no on: block"})`);
  }
  if (!/id-token:\s*write/.test(workflow)) errors.push("deploy.yml does not request id-token: write (OIDC)");
  if (!/role-to-assume:/.test(workflow)) errors.push("deploy.yml has no role-to-assume for the AWS credentials step");
  if (!/configure-aws-credentials@/.test(workflow)) errors.push("deploy.yml does not use aws-actions/configure-aws-credentials");
  if (/\bAWS_ACCESS_KEY_ID\b|\bAWS_SECRET_ACCESS_KEY\b/.test(workflow)) errors.push("deploy.yml references a long-lived AWS access key");
  if (/secrets\.AWS_/i.test(allWorkflows)) errors.push("a workflow references secrets.AWS_*; AWS is reached by OIDC and vars only");

  // rollback must be real: immutable SHA image, new task def revision per service, stability wait,
  // and the tag must be on main
  const steps = workflow.split(/^      - /m).slice(1);
  const co = steps.findIndex((x) => /uses:\s*actions\/checkout@/.test(x));
  if (co < 0) errors.push("deploy.yml does not check out the repo");
  else {
    if (!/fetch-depth:\s*0\b/.test(steps[co])) errors.push("deploy.yml checkout is not fetch-depth: 0 (the main ancestry check needs history)");
    const g = steps[co + 1] ?? "";
    if (!/git merge-base --is-ancestor\s+"?\$\{?GITHUB_SHA\}?"?\s+origin\/main/.test(g)) errors.push("the first step after checkout is not the tag-on-main guard (git merge-base --is-ancestor $GITHUB_SHA origin/main)");
  }
  if (!/docker push\s+"\$IMAGE:\$GITHUB_SHA"/.test(workflow)) errors.push("deploy.yml does not push the image tagged with $GITHUB_SHA");
  if (/docker push[^\n]*:latest/.test(workflow) && !/docker push\s+"\$IMAGE:\$GITHUB_SHA"/.test(workflow)) errors.push("deploy.yml pushes only a mutable :latest");
  for (const c of ["web", "brain"]) {
    const render = steps.find((x) => /amazon-ecs-render-task-definition@/.test(x) && new RegExp(`container-name:\\s*${c}\\b`).test(x));
    if (!render) errors.push(`deploy.yml does not render a new ${c} task definition (amazon-ecs-render-task-definition for container ${c})`);
    else if (!/image:[^\n]*github\.sha/.test(render) || /image:[^\n]*latest/.test(render)) errors.push(`the ${c} task definition image is not pinned to \${{ github.sha }}`);
    const dep = steps.find((x) => /amazon-ecs-deploy-task-definition@/.test(x) && x.includes(`steps.render-${c}.outputs.task-definition`));
    if (!dep) errors.push(`deploy.yml does not register and deploy the rendered ${c} task definition (amazon-ecs-deploy-task-definition)`);
    else if (!/wait-for-service-stability:\s*true/.test(dep)) errors.push(`deploy of ${c} does not wait for service stability`);
  }
  if (/force-new-deployment/.test(workflow)) errors.push("deploy.yml uses --force-new-deployment (rolls back to the same task definition)");

  // --- Dockerfile ---
  const dlines = dockerfile.split("\n").filter((l) => !/^\s*#/.test(l));
  const joined = dlines.join("\n").replace(/\\\n/g, " ");
  const ci = joined.search(/\bnpm ci\b/);
  if (ci < 0) errors.push("Dockerfile has no `npm ci`");
  const beforeCi = ci < 0 ? joined : joined.slice(0, ci);
  if (/\bNODE_ENV[= ]+["']?production/.test(beforeCi)) errors.push("Dockerfile sets NODE_ENV=production before npm ci (dev deps, tsx and typescript, are dropped)");
  const ciLine = (joined.match(/RUN[^\n]*\bnpm ci\b[^\n]*/) ?? [""])[0];
  if (/--omit[= ]dev|--production|--only=prod/.test(ciLine)) errors.push("Dockerfile runs npm ci without dev dependencies");
  if (/^\s*(ENV|ARG)[^\n]*\bAUTH_SECRET\s*=/m.test(joined)) errors.push("Dockerfile bakes AUTH_SECRET into an ENV or ARG default");

  // --- template ---
  const res = template.Resources ?? {};
  const all = Object.entries(res);
  const ofType = (t) => all.filter(([, r]) => r.Type === t);

  const roles = ofType("AWS::IAM::Role").filter(([, r]) => JSON.stringify(r.Properties?.AssumeRolePolicyDocument ?? {}).includes("token.actions.githubusercontent.com"));
  if (!ofType("AWS::IAM::OIDCProvider").length && !JSON.stringify(res).includes("token.actions.githubusercontent.com")) errors.push("template has no GitHub OIDC provider");
  if (!roles.length) errors.push("template has no role trusting the GitHub OIDC provider");
  for (const [id, r] of roles) {
    const subs = [];
    for (const st of r.Properties.AssumeRolePolicyDocument.Statement ?? []) {
      for (const op of Object.values(st.Condition ?? {})) {
        for (const [k, v] of Object.entries(op)) if (k.endsWith(":sub")) subs.push(...[v].flat());
      }
    }
    if (!subs.length) errors.push(`OIDC role ${id} has no :sub condition`);
    const auds = [];
    for (const st of r.Properties.AssumeRolePolicyDocument.Statement ?? []) {
      for (const op of Object.values(st.Condition ?? {})) {
        for (const [k, v] of Object.entries(op)) if (k.endsWith(":aud")) auds.push(...[v].flat());
      }
    }
    if (!auds.length || auds.some((a) => a !== "sts.amazonaws.com")) errors.push(`OIDC role ${id} lacks an :aud condition of sts.amazonaws.com`);
    // no wildcard action on the deploy role
    const rid = id;
    for (const [pid, pol] of ofType("AWS::IAM::Policy")) {
      if (!JSON.stringify(pol.Properties.Roles ?? []).includes(`"${rid}"`)) continue;
      for (const st of [pol.Properties.PolicyDocument?.Statement ?? []].flat()) {
        for (const a of [st.Action ?? []].flat()) {
          if (a === "*" || /:\*$/.test(a)) errors.push(`deploy role policy ${pid} allows wildcard action ${a}`);
        }
      }
    }
    if ((r.Properties.ManagedPolicyArns ?? []).length) errors.push(`deploy role ${id} attaches managed policies; grant scoped statements instead`);
    for (const sub of subs) {
      if (!(typeof sub === "string" && sub.startsWith(REPO + ":") && sub.endsWith("ref:refs/tags/*"))) errors.push(`OIDC trust ${JSON.stringify(sub)} on ${id} is not ${REPO}:ref:refs/tags/*`);
    }
  }

  for (const name of ["WebService", "BrainService"]) {
    const hit = ofType("AWS::ECS::Service").find(([id]) => id.startsWith(name));
    if (!hit) { errors.push(`template has no ${name}`); continue; }
    const cb = hit[1].Properties?.DeploymentConfiguration?.DeploymentCircuitBreaker;
    if (!cb || cb.Enable !== true || cb.Rollback !== true) errors.push(`${name} lacks DeploymentCircuitBreaker {Enable:true, Rollback:true}`);
  }

  const tgs = ofType("AWS::ElasticLoadBalancingV2::TargetGroup");
  if (!tgs.length || tgs.some(([, g]) => g.Properties?.HealthCheckPath !== "/login")) errors.push("a target group health check path is not /login (the circuit breaker keys off it)");

  const repoIds = ofType("AWS::ECR::Repository").map(([id]) => id);
  const tasks = ofType("AWS::ECS::TaskDefinition").flatMap(([, t]) => t.Properties?.ContainerDefinitions ?? []);
  for (const c of tasks) {
    const img = cfn(c.Image);
    if (!repoIds.some((id) => img.includes(`.dkr.ecr.`) && img.includes(`/<${id}>:`))) errors.push(`${c.Name} container image ${img} is not from this stack's ECR repo`);
    if (/:latest$/.test(img) || !/:[^:/]+$/.test(img)) errors.push(`${c.Name} container image ${img} is mutable (latest or untagged)`);
  }
  for (const [cname, want] of [["web", WEB_SECRETS], ["brain", BRAIN_SECRETS]]) {
    const c = tasks.find((x) => x.Name === cname);
    if (!c) { errors.push(`template has no ${cname} container`); continue; }
    for (const s of want) {
      const hit = (c.Secrets ?? []).find((x) => x.Name === s);
      if (!hit || !/^arn:<AWS::Partition>:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:disasterdeck\//.test(cfn(hit.ValueFrom))) errors.push(`${cname} container does not inject ${s} from a Secrets Manager ARN of this stack (got ${hit ? cfn(hit.ValueFrom) : "nothing"})`);
      if ((c.Environment ?? []).some((e) => e.Name === s)) errors.push(`${cname} container sets ${s} as a plain environment value`);
    }
  }
  return errors;
}

function mutations(template, workflow, dockerfile, allWorkflows) {
  const clone = () => JSON.parse(JSON.stringify(template));
  const svc = (t, name) => Object.entries(t.Resources).find(([id, r]) => r.Type === "AWS::ECS::Service" && id.startsWith(name))[1];
  const container = (t, name) => Object.values(t.Resources).filter((r) => r.Type === "AWS::ECS::TaskDefinition").flatMap((r) => r.Properties.ContainerDefinitions).find((c) => c.Name === name);
  const base = { workflow, dockerfile, template, allWorkflows };
  const out = [];
  const add = (label, over) => out.push({ label, input: { ...base, ...over } });

  add("branch push trigger", { workflow: workflow.replace(/push:\n\s+tags: \["v\*"\]/, "push:\n    branches: [main]") });
  add("unscoped tags trigger", { workflow: workflow.replace('tags: ["v*"]', 'tags: ["*"]') });
  add("extra workflow_dispatch trigger", { workflow: workflow.replace('tags: ["v*"]', 'tags: ["v*"]\n  workflow_dispatch:') });
  {
    const t = clone();
    for (const r of Object.values(t.Resources)) {
      const c = r.Properties?.AssumeRolePolicyDocument?.Statement?.[0]?.Condition?.StringLike;
      if (c) for (const k of Object.keys(c)) if (k.endsWith(":sub")) c[k] = `${REPO}:ref:refs/heads/main`;
    }
    add("OIDC trust on a branch ref", { template: t });
  }
  {
    const t = clone();
    for (const r of Object.values(t.Resources)) {
      const c = r.Properties?.AssumeRolePolicyDocument?.Statement?.[0]?.Condition?.StringLike;
      if (c) for (const k of Object.keys(c)) if (k.endsWith(":sub")) c[k] = `${REPO}:*`;
    }
    add("OIDC trust on any ref", { template: t });
  }
  for (const name of ["WebService", "BrainService"]) {
    const t = clone();
    svc(t, name).Properties.DeploymentConfiguration.DeploymentCircuitBreaker.Rollback = false;
    add(`${name} circuit breaker Rollback false`, { template: t });
    const t2 = clone();
    delete svc(t2, name).Properties.DeploymentConfiguration.DeploymentCircuitBreaker;
    add(`${name} circuit breaker missing`, { template: t2 });
  }
  for (const s of WEB_SECRETS) {
    const t = clone();
    const c = container(t, "web");
    c.Secrets = c.Secrets.filter((x) => x.Name !== s);
    add(`web container missing secret ${s}`, { template: t });
    const t2 = clone();
    const c2 = container(t2, "web");
    c2.Secrets = c2.Secrets.filter((x) => x.Name !== s);
    c2.Environment = [...(c2.Environment ?? []), { Name: s, Value: "plain" }];
    add(`web container has ${s} as plain env`, { template: t2 });
  }
  for (const s of BRAIN_SECRETS) {
    const t = clone();
    const c = container(t, "brain");
    c.Secrets = c.Secrets.filter((x) => x.Name !== s);
    add(`brain container missing secret ${s}`, { template: t });
  }
  {
    const t = clone();
    for (const r of Object.values(t.Resources)) {
      const c = r.Properties?.AssumeRolePolicyDocument?.Statement?.[0]?.Condition?.StringEquals;
      if (c) for (const k of Object.keys(c)) if (k.endsWith(":aud")) delete c[k];
    }
    add("OIDC aud condition missing", { template: t });
  }
  for (const action of ["*", "ecs:*"]) {
    const t = clone();
    t.Resources.DeployRoleDefaultPolicyDC930F96.Properties.PolicyDocument.Statement.push({ Effect: "Allow", Action: action, Resource: "*" });
    add(`deploy role statement with Action ${action}`, { template: t });
  }
  {
    const t = clone();
    container(t, "web").Secrets.find((x) => x.Name === "AUTH_SECRET").ValueFrom = "arn:aws:ssm:us-east-1:123456789012:parameter/auth";
    add("web secret from an SSM parameter", { template: t });
    const t2 = clone();
    container(t2, "brain").Secrets.find((x) => x.Name === "MONGODB_URI").ValueFrom = "arn:aws:secretsmanager:us-east-1:123456789012:secret:other/account";
    add("brain secret ARN hardcoded to another account", { template: t2 });
  }
  {
    const t = clone();
    container(t, "web").Image = "public.ecr.aws/nginx/nginx:1.27";
    add("web image from outside this stack's ECR repo", { template: t });
    const t2 = clone();
    const c = container(t2, "brain");
    c.Image = JSON.parse(JSON.stringify(c.Image).replace(/:bootstrap"/, ':latest"'));
    add("brain image pinned to mutable :latest", { template: t2 });
  }
  {
    const t = clone();
    for (const r of Object.values(t.Resources)) if (r.Type === "AWS::ElasticLoadBalancingV2::TargetGroup") r.Properties.HealthCheckPath = "/";
    add("target group health check path /", { template: t });
  }
  add("secrets.AWS_* in the deploy workflow", { workflow: workflow + "\n# ${{ secrets.AWS_ROLE_ARN }}\n", allWorkflows: allWorkflows + "\n# ${{ secrets.AWS_ROLE_ARN }}\n" });
  add("secrets.AWS_* in another workflow", { allWorkflows: allWorkflows + "\n      role: ${{ secrets.AWS_ROLE_ARN }}\n" });
  add("workflow does not push the SHA image", { workflow: workflow.replace('docker push "$IMAGE:$GITHUB_SHA"', "true") });
  for (const c of ["web", "brain"]) {
    add(`workflow does not render a ${c} task definition`, { workflow: workflow.replace(new RegExp(`container-name: ${c}\\b`), "container-name: other") });
    add(`workflow does not deploy the ${c} revision`, { workflow: workflow.replace(`steps.render-${c}.outputs.task-definition`, "steps.x.outputs.y") });
    add(`workflow skips the ${c} stability wait`, { workflow: workflow.replace(new RegExp(`(render-${c}.outputs.task-definition[^]*?)wait-for-service-stability: true`), "$1wait-for-service-stability: false") });
  }
  add("workflow deploys the mutable :latest image", { workflow: workflow.replace(/image: \$\{\{ steps.stack.outputs.repo \}\}:\$\{\{ github.sha \}\}/g, "image: ${{ steps.stack.outputs.repo }}:latest") });
  add("workflow falls back to force-new-deployment", { workflow: workflow + "\n          aws ecs update-service --force-new-deployment\n" });
  add("tag-on-main guard missing", { workflow: workflow.replace(/git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/, "true") });
  add("tag-on-main guard not first after checkout", { workflow: workflow.replace(/(      - name: Tag is on main[^]*?)(      # No AWS)/, "$2$1").replace("      # No AWS access keys. This step asks GitHub's IdP for a token and assumes the deploy role.\n      - name: Authenticate to AWS with OIDC", "      - name: Authenticate to AWS with OIDC") });
  add("checkout is shallow", { workflow: workflow.replace("fetch-depth: 0", "fetch-depth: 1") });
  add("Dockerfile NODE_ENV=production before npm ci", { dockerfile: dockerfile.replace(/(FROM [^\n]*\n)/, "$1ENV NODE_ENV=production\n") });
  add("Dockerfile npm ci --omit=dev", { dockerfile: dockerfile.replace(/RUN npm ci\b/, "RUN npm ci --omit=dev") });
  add("Dockerfile bakes AUTH_SECRET", { dockerfile: dockerfile.replace(/(FROM [^\n]*\n)/, "$1ENV AUTH_SECRET=baked\n") });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ROOT = process.cwd();
  const wfDir = path.join(ROOT, ".github", "workflows");
  const workflow = readFileSync(path.join(wfDir, "deploy.yml"), "utf8");
  const allWorkflows = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => readFileSync(path.join(wfDir, f), "utf8")).join("\n");
  const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const infraDir = path.join(ROOT, "infra");
  let template;
  try {
    template = JSON.parse(execFileSync("npx", ["cdk", "synth", "--json"], { cwd: infraDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    console.error(`FAIL: cdk synth failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    rmSync(path.join(infraDir, "cdk.out"), { recursive: true, force: true });
  }

  const errors = audit({ workflow, dockerfile, template, allWorkflows });
  if (errors.length) {
    console.error(`\nFAIL (${errors.length}):`);
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("OK: real inputs pass (OIDC on tags, rollback on both services, secrets from Secrets Manager, dev deps in image).");

  const cases = mutations(template, workflow, dockerfile, allWorkflows);
  const missed = cases.filter((c) => audit(c.input).length === 0).map((c) => c.label);
  // a mutation that leaves the input unchanged would pass vacuously; require each to differ
  const noop = cases.filter((c) => JSON.stringify(c.input) === JSON.stringify({ workflow, dockerfile, template, allWorkflows })).map((c) => c.label);
  if (missed.length || noop.length) {
    console.error(`\nNEGATIVE TESTS FAIL: not caught: ${JSON.stringify(missed)}; no-op fixtures: ${JSON.stringify(noop)}`);
    process.exit(1);
  }
  console.log(`OK: ${cases.length} negative fixtures each rejected by the audit.`);
}

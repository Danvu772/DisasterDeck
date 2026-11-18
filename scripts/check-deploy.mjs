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
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const REPO = "repo:Danvu772/DisasterDeck";
const WEB_SECRETS = ["MONGODB_URI", "OPENROUTER_API_KEY", "AUTH_SECRET", "SSOJET_CLIENT_ID", "SSOJET_CLIENT_SECRET", "SSOJET_ISSUER_URL"];
const BRAIN_SECRETS = ["MONGODB_URI", "OPENROUTER_API_KEY"];

export function audit({ workflow, dockerfile, template }) {
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

  const tasks = ofType("AWS::ECS::TaskDefinition").flatMap(([, t]) => t.Properties?.ContainerDefinitions ?? []);
  for (const [cname, want] of [["web", WEB_SECRETS], ["brain", BRAIN_SECRETS]]) {
    const c = tasks.find((x) => x.Name === cname);
    if (!c) { errors.push(`template has no ${cname} container`); continue; }
    for (const s of want) {
      const hit = (c.Secrets ?? []).find((x) => x.Name === s);
      if (!hit || !JSON.stringify(hit.ValueFrom).includes("secretsmanager")) errors.push(`${cname} container does not inject ${s} from Secrets Manager`);
      if ((c.Environment ?? []).some((e) => e.Name === s)) errors.push(`${cname} container sets ${s} as a plain environment value`);
    }
  }
  return errors;
}

function mutations(template, workflow, dockerfile) {
  const clone = () => JSON.parse(JSON.stringify(template));
  const svc = (t, name) => Object.entries(t.Resources).find(([id, r]) => r.Type === "AWS::ECS::Service" && id.startsWith(name))[1];
  const container = (t, name) => Object.values(t.Resources).filter((r) => r.Type === "AWS::ECS::TaskDefinition").flatMap((r) => r.Properties.ContainerDefinitions).find((c) => c.Name === name);
  const base = { workflow, dockerfile, template };
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
  add("Dockerfile NODE_ENV=production before npm ci", { dockerfile: dockerfile.replace(/(FROM [^\n]*\n)/, "$1ENV NODE_ENV=production\n") });
  add("Dockerfile npm ci --omit=dev", { dockerfile: dockerfile.replace(/RUN npm ci\b/, "RUN npm ci --omit=dev") });
  add("Dockerfile bakes AUTH_SECRET", { dockerfile: dockerfile.replace(/(FROM [^\n]*\n)/, "$1ENV AUTH_SECRET=baked\n") });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ROOT = process.cwd();
  const workflow = readFileSync(path.join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");
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

  const errors = audit({ workflow, dockerfile, template });
  if (errors.length) {
    console.error(`\nFAIL (${errors.length}):`);
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("OK: real inputs pass (OIDC on tags, rollback on both services, secrets from Secrets Manager, dev deps in image).");

  const cases = mutations(template, workflow, dockerfile);
  const missed = cases.filter((c) => audit(c.input).length === 0).map((c) => c.label);
  // a mutation that leaves the input unchanged would pass vacuously; require each to differ
  const noop = cases.filter((c) => JSON.stringify(c.input) === JSON.stringify({ workflow, dockerfile, template })).map((c) => c.label);
  if (missed.length || noop.length) {
    console.error(`\nNEGATIVE TESTS FAIL: not caught: ${JSON.stringify(missed)}; no-op fixtures: ${JSON.stringify(noop)}`);
    process.exit(1);
  }
  console.log(`OK: ${cases.length} negative fixtures each rejected by the audit.`);
}

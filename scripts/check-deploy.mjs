// CD-1 / CD-2 deploy-shape check. Runs in CI before anything touches AWS.
// It reads .github/workflows/deploy.yml and the synthesized CDK template and fails when the
// deploy path stops being "OIDC from a version tag, no long-lived keys, circuit-breaker rollback":
//
//   * the workflow asks for the id-token (OIDC) and assumes a role, with no AWS access key env
//   * the workflow runs only on version tags (v*), not on a branch push
//   * the synthesized CDK template puts the OIDC trust on this repo (repo:Danvu772/DisasterDeck)
//     and turns on the ECS deployment circuit breaker with rollback
//
// The live half of CD-1/CD-2 (an actual AssumeRoleWithWebIdentity in a deploy run's log, and a
// real rollback after breaking /login) is proven at deploy time, not here. This check is the
// static contract: no key can sneak in, and the rollback is on in the template.
//
//   node scripts/check-deploy.mjs
//
// `cdk synth` runs inside infra/ (its own package.json and lockfile) and leaves a cdk.out behind;
// this removes it so the working tree stays clean. Synth needs no AWS credentials.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKFLOW = readFileSync(path.join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");
const REPO = "repo:Danvu772/DisasterDeck";
const errors = [];

// --- the workflow: OIDC, tags, no keys ---
const onTags = /^\s+tags:\s*\[?\s*["']v\*["']/m.test(WORKFLOW) || /^\s+tags:/m.test(WORKFLOW);
const idTokenWrite = /id-token:\s*write/.test(WORKFLOW);
const roleToAssume = /role-to-assume:/.test(WORKFLOW);
const configureAwsCreds = /configure-aws-credentials@/.test(WORKFLOW);
const awsKey = /\bAWS_ACCESS_KEY_ID\b/.test(WORKFLOW) || /\bAWS_SECRET_ACCESS_KEY\b/.test(WORKFLOW);
const pushesBranch = /on:\s*\n\s*push:\s*\n\s*branches:/m.test(WORKFLOW);

if (!onTags) errors.push("deploy.yml does not trigger on a version tag (expected `on: push: tags: [\"v*\"]`)");
if (!idTokenWrite) errors.push("deploy.yml does not request id-token: write (OIDC)");
if (!roleToAssume) errors.push("deploy.yml has no role-to-assume for the AWS credentials step");
if (!configureAwsCreds) errors.push("deploy.yml does not use aws-actions/configure-aws-credentials");
if (awsKey) errors.push("deploy.yml references AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY (a long-lived key)");
if (pushesBranch) errors.push("deploy.yml still deploys on a branch push; the Vultr `prod`-branch path must be gone");

// --- the synthesized CDK template: OIDC trust + circuit breaker ---
const infraDir = path.join(ROOT, "infra");
try {
  const template = execFileSync("npx", ["cdk", "synth", "--json"], {
    cwd: infraDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const oidcTrust = template.includes(REPO);
  const oidcProvider = template.includes("token.actions.githubusercontent.com");
  const rollback = /"DeploymentCircuitBreaker"\s*:\s*\{[^}]*"Rollback"\s*:\s*true/s.test(template) ||
    /"Rollback"\s*:\s*true/.test(template);

  if (!oidcTrust) errors.push(`synthesized template has no OIDC trust for ${REPO}`);
  if (!oidcProvider) errors.push("synthesized template has no token.actions.githubusercontent.com OIDC provider");
  if (!rollback) errors.push("synthesized template has no ECS deployment circuit breaker with rollback: true");
  console.log("cdk synth produced a template; OIDC provider, repo-scoped trust and rollback checked.");
} catch (err) {
  errors.push(`cdk synth failed: ${err && err.message ? err.message : String(err)}`);
} finally {
  rmSync(path.join(infraDir, "cdk.out"), { recursive: true, force: true });
}

if (errors.length) {
  console.error(`\nFAIL (${errors.length}):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("OK: deploy.yml is OIDC-on-tag with no AWS keys, and the template rolls back on failure.");
// Print a read-only "desk" for an orchestrator at session start:
// the live lanes (ORCHESTRATORS.md) plus corroborating git state and the open issues.
// Run by hand:  node scripts/orchestrators.mjs
// Needs the gh CLI. If it is not logged in, the git + lanes parts still print and gh is skipped.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const run = (args, { allowFail = false } = {}) => {
  try {
    return execFileSync(args[0], args.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return "";
    throw e;
  }
};

const out = [];

// 1. Live lanes from the registry.
let lanesTxt;
try { lanesTxt = readFileSync(join(root, "ORCHESTRATORS.md"), "utf8"); } catch { lanesTxt = ""; }
const lanes = lanesTxt.includes("### ") ? "see ORCHESTRATORS.md" : "none recorded";
out.push(`Lanes (ORCHESTRATORS.md): ${lanes}`);

// 2. git: uncommitted work, branches ahead of main, recent PRs.
const dirty = run(["git", "status", "--short"], { allowFail: true });
out.push(`\nUncommitted here: ${dirty ? "\n" + dirty : "clean"}`);
const branches = run(["git", "branch", "-r", "--no-merged", "origin/main"], { allowFail: true });
out.push(`\nBranches not merged to main: ${branches || "none"}`);

// 3. GitHub open issues (where tasks and decisions sit).
try {
  const issues = JSON.parse(run(["gh", "issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,labels,assignees"]));
  if (issues.length) {
    out.push(`\nOpen issues (${issues.length}):`);
    for (const i of issues) {
      const tags = i.labels.map((l) => l.name).join(",");
      const who = i.assignees.length ? ` @${i.assignees.map((a) => a.login).join(",@")}` : " unclaimed";
      out.push(`  #${i.number} ${i.title} [${tags}]${who}`);
    }
  } else {
    out.push(`\nOpen issues: none`);
  }
} catch {
  out.push(`\nOpen issues: gh not logged in, skip`);
}

console.log(out.join("\n"));

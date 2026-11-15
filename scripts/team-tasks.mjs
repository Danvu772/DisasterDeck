// Shared team tracking for every Claude session: prints the open GitHub issues in priority order.
// Runs as a SessionStart hook (.claude/settings.json) and by hand: node scripts/team-tasks.mjs
// Read-only. Needs the gh CLI logged in. If it is not, it says so and exits 0, so a session still starts.
import { execFileSync } from "node:child_process";

const MAX_LINES = 60;
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Lower is more urgent. A decision blocks everyone, so it sits next to the demo-critical work.
const RANK = ["demo-critical", "decision", "blocks-frontend", "gap", "tracking"];
const rankOf = (labels) => {
  const i = RANK.findIndex((r) => labels.includes(r));
  return i === -1 ? RANK.length : i;
};
const roleOf = (labels) => labels.find((l) => l.startsWith("role:")) ?? "no role";

let me = "";
try { me = gh(["api", "user", "--jq", ".login"]).trim(); } catch { /* not logged in: everything is "others" */ }

let issues;
try {
  issues = JSON.parse(gh(["issue", "list", "--state", "open", "--limit", "200", "--json", "number,title,labels,assignees,updatedAt"]));
} catch {
  console.log("Team tasks: could not read GitHub issues (run `gh auth login`). The list lives at the repo's Issues tab.");
  process.exit(0);
}

const rows = issues.map((i) => {
  const labels = i.labels.map((l) => l.name);
  const owners = i.assignees.map((a) => a.login);
  return { n: i.number, title: i.title, labels, owners, role: roleOf(labels), rank: rankOf(labels) };
}).sort((a, b) => a.rank - b.rank || a.n - b.n);

const line = (r) => {
  const tags = [r.labels.filter((l) => RANK.includes(l)).join(","), r.role].filter(Boolean).join(" · ");
  const who = r.owners.length ? `@${r.owners.join(", @")}` : "unclaimed";
  return `  #${r.n} ${r.title}  [${tags}] ${who}`;
};

const mine = rows.filter((r) => me && r.owners.includes(me));
const free = rows.filter((r) => r.owners.length === 0);
const others = rows.filter((r) => r.owners.length && !r.owners.includes(me));

const out = [];
out.push(`Team tasks: ${rows.length} open issues${me ? `, you are @${me}` : " (gh login unknown: no 'yours' list)"}.`);
out.push("Before you start work, check this list. Claim a task with `gh issue edit <n> --add-assignee @me` first, or say why you are not taking it.");
out.push("");
out.push(`Yours (${mine.length}):`, ...(mine.length ? mine.map(line) : ["  none"]), "");
out.push(`Unclaimed (${free.length}):`, ...(free.length ? free.map(line) : ["  none"]), "");
out.push(`Claimed by others (${others.length}):`, ...(others.length ? others.map(line) : ["  none"]));
const lines = out.slice(0, MAX_LINES);
if (out.length > MAX_LINES) lines.push(`  ... ${out.length - MAX_LINES} more lines, run: node scripts/team-tasks.mjs`);
console.log(lines.join("\n"));

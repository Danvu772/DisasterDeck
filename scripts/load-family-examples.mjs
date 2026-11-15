// Publish fictional examples through the same coordinator API as the UI.
// Refuses shared MongoDB and non-loopback targets; reruns skip active matching names.
import { readFileSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--url")) throw new Error("Usage: npm run voice:examples -- --url http://127.0.0.1:3675");
  const target = new URL(args[1] || "http://127.0.0.1:3675");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !["http:", "https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/" || target.search || target.hash)
    throw new Error("Use a loopback demo origin without credentials, paths or query parameters");
  const origin = target.origin;
  const endpoint = origin + "/api/voice/updates?user=coordinator-duty";
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Start the local demo and verify coordinator-duty access first");
  const board = await response.json();
  if (board.storage !== "temporary demo memory") throw new Error("Example loader only writes to temporary demo memory. Use the coordinator UI for a configured database.");
  if (!board.sites?.length) throw new Error("No demo cases are available");
  const data = JSON.parse(readFileSync(new URL("../data/family-voice-examples.json", import.meta.url), "utf8"));
  if (data.synthetic !== true || !Array.isArray(data.examples)) throw new Error("Expected explicitly synthetic examples");
  for (const item of data.examples) {
    if (typeof item.alias !== "string" || item.alias.length > 80 || typeof item.summary !== "string" || !item.summary.startsWith("FICTIONAL DEMO:") || item.summary.length > 1500 || !Number.isInteger(item.siteIndex) || item.siteIndex < 0 || !Number.isFinite(item.observedMinutesAgo) || item.observedMinutesAgo < 0)
      throw new Error("Invalid fictional example; check names, summary, case index and observation age");
  }
  let added = 0;
  for (const item of data.examples) {
    if (board.updates.some(update => update.alias === item.alias && !update.revoked && Date.parse(update.expiresAt) > Date.now())) {
      console.log("Already available:", item.alias); continue;
    }
    const result = await fetch(endpoint, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ siteId: board.sites[item.siteIndex % board.sites.length]._id, alias: item.alias, summary: item.summary, sourceAt: new Date(Date.now() - item.observedMinutesAgo * 60_000).toISOString() }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) throw new Error(`Could not publish ${item.alias} (${result.status})`);
    console.log("Published:", item.alias); added++;
  }
  console.log(`Added ${added} fictional examples. Refresh ${origin}/family and search by name. Reload after a server restart; no model/audio calls were made.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

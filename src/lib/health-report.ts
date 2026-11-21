// Health of every subsystem we run: npm run health
// Reads the database, the process table, the config keys and the dev server. Writes nothing.
// status: ok, warn, down, idle (running, nothing recent), off (not configured).
import { configuredDeskId } from "./pilot";
import { execSync } from "node:child_process";
import { closeDb, cols } from "./db";

type Status = "ok" | "warn" | "down" | "idle" | "off";
interface Row { subsystem: string; status: Status; detail: string }

const now = Date.now();
const ago = (d?: Date | string | null) => (d ? Math.round((now - new Date(d).getTime()) / 1000) : null);
const agoText = (s: number | null) => (s === null ? "never" : s < 120 ? `${s}s ago` : s < 7200 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);
const running = (script: string) => {
  try { return execSync(`pgrep -f "${script}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0; }
  catch { return false; }
};
const set = (k: string) => Boolean(process.env[k]?.trim());

async function main() {
  const rows: Row[] = [];
  const c = await cols();
  const desk = configuredDeskId();

  // Database
  try {
    const count = await c.events.estimatedDocumentCount();
    rows.push({ subsystem: "mongo", status: "ok", detail: `${process.env.MONGODB_DB ?? "db"}, ${count} events` });
  } catch (e) {
    rows.push({ subsystem: "mongo", status: "down", detail: e instanceof Error ? e.message : String(e) });
  }

  // Brain: lease and heartbeat (the sweeper and dispatcher run inside it)
  const lease = await c.meta.findOne({ _id: "brain-lease" as never });
  const beat = ago((await c.meta.findOne({ _id: "brain" as never }))?.lastLoopAt);
  const leaseLive = lease?.until && new Date(lease.until).getTime() > now;
  const brainUp = Boolean(leaseLive) && beat !== null && beat < 10;
  rows.push({
    subsystem: "brain (sweeper, dispatcher inside)",
    status: brainUp ? "ok" : leaseLive ? "warn" : "down",
    detail: `${leaseLive ? `holder ${lease?.holder}` : "no lease"}, heartbeat ${agoText(beat)}, process ${running("workers/brain.ts") ? "running" : "not running"}`,
  });

  // Event queue
  const [pending, working, failed] = await Promise.all(
    (["pending", "working", "failed"] as const).map((s) => c.events.countDocuments({ status: s, deskId: desk })),
  );
  const oldest = await c.events.findOne({ status: "pending", deskId: desk }, { sort: { ts: 1 }, projection: { ts: 1 } });
  const oldestS = ago(oldest?.ts);
  rows.push({
    subsystem: "event queue",
    status: failed > 0 || (oldestS !== null && oldestS > 30) ? "warn" : "ok",
    detail: `pending ${pending}, working ${working}, failed ${failed}, oldest pending ${agoText(oldestS)}`,
  });

  // Memory keeper: last event it applied
  const lastApplied = await c.events.findOne({ status: { $in: ["done", "merged", "rejected"] }, deskId: desk }, { sort: { ts: -1 }, projection: { ts: 1, type: 1, status: 1 } });
  const keeperS = ago(lastApplied?.ts);
  rows.push({
    subsystem: "memory keeper",
    status: keeperS === null ? "idle" : "ok",
    detail: lastApplied ? `last applied ${lastApplied.type} → ${lastApplied.status} ${agoText(keeperS)}` : "no events applied yet",
  });

  // Dispatcher: last task change
  const lastTask = await c.tasks.find({ deskId: desk }).sort({ "history.ts": -1 }).limit(1).toArray();
  const lastTaskTs = lastTask[0]?.history?.reduce<Date | null>((m, h) => (!m || new Date(h.ts) > m ? new Date(h.ts) : m), null) ?? null;
  const open = await c.tasks.countDocuments({ deskId: desk, open: true });
  const escalated = await c.tasks.countDocuments({ deskId: desk, open: true, status: "escalated" });
  rows.push({
    subsystem: "dispatcher (tasks)",
    status: escalated > 0 ? "warn" : open ? "ok" : "idle",
    detail: `${open} open, ${escalated} escalated, last task change ${agoText(ago(lastTaskTs))}`,
  });

  // Personal agents (chat)
  const lastMsg = await c.messages.findOne({}, { sort: { ts: -1 }, projection: { ts: 1 } });
  rows.push({
    subsystem: "personal agents (chat)",
    status: set("OPENROUTER_API_KEY") ? (ago(lastMsg?.ts) !== null ? "ok" : "idle") : "off",
    detail: `${set("OPENROUTER_API_KEY") ? "key set" : "no OPENROUTER_API_KEY"}, last message ${agoText(ago(lastMsg?.ts))}`,
  });

  // Config-only subsystems
  rows.push({
    subsystem: "voice (ElevenLabs)",
    status: set("ELEVENLABS_API_KEY") ? "ok" : "off",
    detail: set("ELEVENLABS_API_KEY") ? "key set: /api/chat takes voice notes" : "no key: /api/chat takes text only (/field dictates on the phone, it does not need this)",
  });
  rows.push({ subsystem: "auth (SSOJet)", status: set("SSOJET_CLIENT_ID") && set("AUTH_SECRET") ? "ok" : "off", detail: `${process.env.DEMO_MODE === "true" ? "demo mode on" : "demo mode off"}, AUTH_SECRET ${set("AUTH_SECRET") ? "set" : "missing"}` });
  rows.push({ subsystem: "basemap (Esri, OSM fallback)", status: "ok", detail: "Esri raster tiles, public OSM as the fallback (D-0006)" });

  // Web server
  try {
    const r = await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(3000), cache: "no-store" });
    rows.push({ subsystem: "web (localhost:3000)", status: r.ok ? "ok" : "warn", detail: `HTTP ${r.status}` });
  } catch {
    rows.push({ subsystem: "web (localhost:3000)", status: "down", detail: "not answering" });
  }

  const width = Math.max(...rows.map((r) => r.subsystem.length));
  console.log(`Health for desk ${desk}, ${new Date().toISOString().slice(0, 19)}Z\n`);
  for (const r of rows) console.log(`${r.status.toUpperCase().padEnd(5)} ${r.subsystem.padEnd(width)}  ${r.detail}`);
  const bad = rows.filter((r) => r.status === "down" || r.status === "warn").length;
  console.log(`\n${rows.length} subsystems, ${bad} need attention`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => { console.error("health failed:", err); await closeDb(); process.exit(1); });

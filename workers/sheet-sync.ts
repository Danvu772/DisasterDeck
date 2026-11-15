// Sheet sync: the volunteers' shelter sheet and the desk, both ways. No LLM, no cost. Owner: Role 2.
//
//   npx tsx --env-file=.env.local workers/sheet-sync.ts           every 30 s, until stopped
//   npx tsx --env-file=.env.local workers/sheet-sync.ts --once    one pass, then exit
//   npx tsx --env-file=.env.local workers/sheet-sync.ts --dry     show what it would write, write nothing
//
// MongoDB stays the one source of truth. The sheet is a door for people who never open the app:
//   sheet → desk  A row a person changed ("Barınak B | 41 | 60") becomes a `capacity` event,
//                 source "sheet". The Brain merges it with the other sources.
//   desk → sheet  When the desk knows a newer number from somewhere else (a whiteboard photo, a
//                 shelter's agent), the row gets it, with the source and the time.
// Rules that keep it honest:
//   - A row a person changed in the last 5 minutes is never overwritten. The desk's number goes
//     into the Note column instead, and the person decides.
//   - A number the desk got from the sheet is never written back to the sheet.
//   - What this worker wrote is remembered, so its own write is not read back as a person's edit.
// Setup: agents/TODO.md, "Google Sheets".

import { configuredDeskId } from "../lib/pilot";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CapacityPayload, Shelter } from "@/lib/types";
import { desk } from "../agents/desk";
import { normName, sheetFromEnv, type SheetRow } from "../agents/research/sheets";

const once = process.argv.includes("--once");
const dry = process.argv.includes("--dry");
const EVERY_MS = Number(process.env.SHEET_POLL_SECONDS ?? 30) * 1000;
const HUMAN_GRACE_MS = 5 * 60_000;
const deskId = configuredDeskId();
const log = (...m: unknown[]) => console.error(`[sheet-sync ${new Date().toISOString().slice(11, 19)}]`, ...m);

// What we know about each row between passes, kept on disk so a restart does not re-post everything.
interface RowState { values: string; byUs: boolean; changedAt: string }
const STATE_FILE = process.env.SHEET_STATE_FILE ?? path.join(process.cwd(), "agents", ".sheet", "state.json");
const state: Record<string, RowState> = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const saveState = () => {
  if (dry) return;
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
};

const vals = (used?: number, total?: number) => `${used}/${total}`;
// Türkiye time is UTC+3 all year (no daylight saving since 2016). Formatted by hand: "15.11 10:19".
const trTime = (d: Date) => {
  const t = new Date(d.getTime() + 3 * 3600_000).toISOString();
  return `${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}`;
};
const lastSource = (s: Shelter) => s.history?.[s.history.length - 1]?.source ?? "desk";

async function pass() {
  const sheet = sheetFromEnv();
  if (!sheet) throw new Error("no sheet configured: set GOOGLE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT_FILE, or GOOGLE_SHEET_CSV_URL");
  const d = desk();
  const { rows } = await sheet.read();
  const now = new Date();

  // ---- sheet → desk ----
  let posted = 0;
  for (const r of rows) {
    if (r.used === undefined || r.total === undefined || r.total <= 0) continue;
    const key = normName(r.shelter);
    const v = vals(r.used, r.total);
    const prev = state[key];
    if (prev?.values === v) continue;                       // nothing changed
    if (prev?.byUs && prev.values === v) continue;          // our own write coming back
    const payload: CapacityPayload = { shelter: r.shelter, bedsUsed: r.used, bedsTotal: r.total };
    if (dry) {
      log(`would post capacity ${r.shelter} ${v} (row ${r.row})`);
    } else {
      const id = await d.postEvent({
        deskId, type: "capacity", source: "sheet", actor: "sheet-agent", payload,
        observedAt: now.toISOString(), dedupeKey: `sheet:${key}:${v}:${now.toISOString().slice(0, 16)}`,
      });
      log(`sheet → desk: ${r.shelter} ${v} (row ${r.row}) → event ${id}`);
      posted++;
    }
    state[key] = { values: v, byUs: false, changedAt: now.toISOString() };
  }

  // ---- desk → sheet ----
  if (!sheet.canWrite && !dry) {
    saveState();
    return log(`pass done: ${posted} posted · read-only sheet, nothing written back`);
  }
  const board = await d.getBoard(deskId);
  const byName = new Map(rows.map((r) => [normName(r.shelter), r] as const));
  let written = 0;
  for (const s of board.shelters) {
    const src = lastSource(s);
    if (src === "sheet") continue;                          // it came from the sheet: never echo it
    const key = normName(s.name);
    const row: SheetRow | undefined = byName.get(key) ??
      rows.find((r) => normName(r.shelter).includes(key) || key.includes(normName(r.shelter)));
    const v = vals(s.bedsUsed, s.bedsTotal);
    const seenAt = new Date(s.observedAt ?? s.updated ?? now);
    const cells = { used: s.bedsUsed, total: s.bedsTotal, source: src, updated: trTime(seenAt), note: "" };

    if (!row) {
      if (dry) log(`would add row: ${s.name} ${v} · ${src} · ${trTime(seenAt)}`);
      else { await sheet.appendRow({ shelter: s.name, ...cells }); written++; log(`desk → sheet: new row ${s.name} ${v} (${src})`); }
      state[key] = { values: v, byUs: true, changedAt: now.toISOString() };
      continue;
    }
    if (vals(row.used, row.total) === v) continue;          // already the same
    const rowKey = normName(row.shelter);
    const human = state[rowKey] && !state[rowKey].byUs ? Date.parse(state[rowKey].changedAt) : 0;
    if (human && seenAt.getTime() <= human) continue;       // the person's number is newer
    if (human && now.getTime() - human < HUMAN_GRACE_MS) {
      const note = `Masa: ${v} · ${src} · ${trTime(seenAt)}`;
      if (row.note !== note) {
        if (dry) log(`would note on row ${row.row} (${row.shelter}, edited by a person ${Math.round((now.getTime() - human) / 60000)} min ago): ${note}`);
        else { await sheet.writeRow(row.row, { note }); written++; log(`desk → sheet: note only on ${row.shelter}: ${note}`); }
      }
      continue;
    }
    if (dry) log(`would update row ${row.row} ${row.shelter}: ${vals(row.used, row.total)} → ${v} · ${src} · ${trTime(seenAt)}`);
    else { await sheet.writeRow(row.row, cells); written++; log(`desk → sheet: ${row.shelter} ${vals(row.used, row.total)} → ${v} (${src})`); }
    state[rowKey] = { values: v, byUs: true, changedAt: now.toISOString() };
  }
  saveState();
  log(`pass done: ${posted} posted to the desk, ${written} written to the sheet${dry ? " (dry run)" : ""}`);
}

async function main() {
  const sheet = sheetFromEnv();
  log(`sheet: ${sheet ? `${sheet.mode}${sheet.canWrite ? " (read + write)" : " (read only)"}` : "not configured"} · desk: ${desk().name}`);
  for (;;) {
    try { await pass(); } catch (e) { log(`pass failed: ${(e as Error).message}`); if (once) process.exitCode = 1; }
    if (once || dry) break;
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
  await desk().close?.();
}

main();

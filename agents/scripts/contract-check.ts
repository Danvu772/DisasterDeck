// Do our agents fill POST /api/events the way Role 1's schema (and Swagger at /api/docs) says?
// Builds every event our code can produce, through the real code paths, on the fake desk
// (nothing is written to MongoDB, no model call), and checks each one against lib/schemas.ts eventBody.
//   DESK_BACKEND=fixture npx tsx agents/scripts/contract-check.ts

import { pilot } from "@/lib/pilot";
import { eventBody } from "../../lib/schemas";
import { desk } from "../desk";
import type { NewEvent } from "../desk/port";
import { runTool } from "../personal/tools";

async function main() {
  if (desk().name !== "fixture") throw new Error("run with DESK_BACKEND=fixture: this check must not write to the real desk");
  const captured: NewEvent[] = [];
  const d = desk();
  const post = d.postEvent.bind(d);
  d.postEvent = async (e) => { captured.push(e); return post(e); };

  // Personal agents: every write tool, as the role that may use it.
  const call = async (userId: string, tool: string, input: Record<string, unknown>) => {
    const ctx = await d.getUserContext(userId);
    const out = await runTool(tool, input, ctx);
    if (out.isError) console.log(`  (tool ${tool} for ${userId} refused: ${out.content.slice(0, 90)})`);
  };
  const vctx = await d.getUserContext("volunteer-callback");
  const fctx = await d.getUserContext("field-alpha");
  const sctx = await d.getUserContext("supplier-primary");
  const cctx = await d.getUserContext("coordinator-duty");
  await call("volunteer-callback", "answer_task", { task_id: vctx.tasks[0]?._id, result: "done", note: "called, voices heard", eta_minutes: null });
  await call("field-alpha", "file_report", { kind: "trapped", text: "Ayşe'ye ulaştık", text_en: "We reached Ayşe", address: "Çınar St. 3", region: null, people_count: 1, site_id: fctx.records.sites[0]?._id ?? null });
  await call("field-alpha", "file_need", { item: "blankets", quantity: 10, life_threatening: false, site_id: null, region: null });
  await call("field-alpha", "file_closure", { road: "İnönü Ave", state: "closed", reason: "collapsed building" });
  await call("supplier-primary", "report_problem", { kind: "vehicle_breakdown", text: "Lastik patladı", text_en: "Flat tire", task_id: sctx.tasks[0]?._id ?? null, can_continue: false, can_deliver: null, resolved: false, incident_id: null });
  await call("field-alpha", "declare_work", { what: "rescue", text: "Kazıyoruz", text_en: "We are digging", record_id: null, eta_minutes: 30 });
  await call("field-alpha", "correct_record", { action: "edit", record_type: "site", record_id: fctx.records.sites[0]?._id ?? "site-52", field: "peopleTrapped", value: "2", reason: "two people, not three" });
  await call("public-demo", "file_need", { item: "tent", quantity: 1, life_threatening: true, site_id: null, region: null });
  await call("coordinator-duty", "decide_approval", { task_id: cctx.approvals[0]?._id, approved: true, reason: "nearest free team" });

  // Inline shapes an API client posts for a news closure and a shelter capacity.
  captured.push({ deskId: pilot.id, type: "closure", source: "news", actor: "official-agent", dedupeKey: "official:abc",
    observedAt: "2023-02-07T00:00:00.000Z", payload: { road: "Antakya ring road", state: "closed", reason: "landslide (news)" } });
  captured.push({ deskId: pilot.id, type: "capacity", source: "sheet", actor: "sheet-agent", dedupeKey: "sheet:demo b:31/40:t",
    observedAt: new Date().toISOString(), payload: { shelter: "Demo Barınak B", bedsUsed: 31, bedsTotal: 40 } });

  let ok = 0;
  console.log(`\nchecked ${captured.length} events against eventBody:`);
  for (const e of captured) {
    const r = eventBody.safeParse(e);
    const where = `${e.type.padEnd(10)} ${e.source.padEnd(7)} ${e.actor}`;
    if (r.success) {
      ok++;
      const dropped = Object.keys(e.payload as object).filter((k) => !(k in (r.data.payload as object)));
      console.log(`  ✓ ${where}${dropped.length ? `   (fields the schema drops: ${dropped.join(", ")})` : ""}`);
    } else {
      console.log(`  ✗ ${where}   ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
  }
  console.log(`\n${ok}/${captured.length} fit the schema`);
}

main().catch((e) => { console.error(e); process.exit(1); });

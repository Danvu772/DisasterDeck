// Smoke test for the personal agents: a few real turns, one per role, on the fake desk.
// Prints each reply, what was filed, and the cost. Costs real money (about $0.02–0.05 per turn).
//
//   npx tsx --env-file=.env.local agents/scripts/smoke.ts            all scenarios
//   npx tsx --env-file=.env.local agents/scripts/smoke.ts field shelter   only some

import { runTurn } from "../personal/turn";
import { spentUsd } from "../shared/cost";

const SCENARIOS: Record<string, { userId: string; turns: string[] }> = {
  volunteer: { userId: "zeynep", turns: ["Örnek Sokak 12'yi aradım, ses var, 1 kişi içeride. Telefonum da %8'de."] },
  field: { userId: "team-4", turns: ["Need 20 more blankets at Çınar, one more person has hypothermia. We got one out alive."] },
  supplier: { userId: "supplier-2", turns: ["Lastik patladı, 14. km'deyim, 30 battaniye kamyonda. Yardım lazım."] },
  coordinator: { userId: "coord-1", turns: ["What's stuck right now?", "Approve the Kale dispatch."] },
  citizen: { userId: "citizen-1", turns: ["6 kişiyiz, bir bebek var, çadırımız yok, çok soğuk. Nerede kalabiliriz?"] },
  shelter: { userId: "shelter-b-staff", turns: ["Board says 31 of 60 now. We are out of diapers."] },
};

async function main() {
  const pick = process.argv.slice(2);
  const start = spentUsd();
  for (const [name, s] of Object.entries(SCENARIOS)) {
    if (pick.length && !pick.includes(name)) continue;
    for (const text of s.turns) {
      const before = spentUsd();
      const t0 = Date.now();
      const r = await runTurn({ userId: s.userId, text });
      console.log(`\n── ${name} (${s.userId}) · ${((Date.now() - t0) / 1000).toFixed(1)} s · $${(spentUsd() - before).toFixed(4)} · ${r.model}`);
      console.log(`  says:  ${text}`);
      console.log(`  agent: ${r.reply}`);
      for (const a of r.actions) console.log(`  ${a.ok ? "✓" : "✗"} ${a.tool}: ${a.summary}`);
    }
  }
  console.log(`\nTotal this run: $${(spentUsd() - start).toFixed(4)} · all-time agent spend: $${spentUsd().toFixed(4)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

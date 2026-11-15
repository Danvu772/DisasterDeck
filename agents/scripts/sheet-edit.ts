// Change one shelter's "Dolu" cell in the sheet, as a person would. For testing the sync.
//   npx tsx --env-file=.env.local agents/scripts/sheet-edit.ts "Demo Barınak B" 31

import { normName, sheetFromEnv } from "../research/sheets";

async function main() {
  const [name, used] = [process.argv[2], Number(process.argv[3])];
  if (!name || !Number.isFinite(used)) throw new Error('usage: sheet-edit.ts "<shelter>" <beds used>');
  const sheet = sheetFromEnv();
  if (!sheet?.canWrite) throw new Error("needs GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_FILE");
  const { rows } = await sheet.read();
  const row = rows.find((r) => normName(r.shelter) === normName(name));
  if (!row) throw new Error(`no row "${name}". Rows: ${rows.map((r) => r.shelter).join(", ")}`);
  await sheet.writeRow(row.row, { used });
  console.log(`row ${row.row} ${row.shelter}: Dolu ${row.used} → ${used}`);
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });

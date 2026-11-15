// Put the header row into the shelter sheet (GOOGLE_SHEET_ID), bold and frozen, if row 1 is empty.
//   npx tsx --env-file=.env.local agents/scripts/sheet-init.ts
// The sheet must be shared with the service account's email as editor.

import { serviceAccountToken } from "../research/sheets";

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? "agents/.secrets/google-sa.json";
const ID = process.env.GOOGLE_SHEET_ID;
const HEADER = ["Barınak", "Dolu", "Kapasite", "Kaynak", "Güncelleme", "Not"];

async function google(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ID}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  if (!ID) throw new Error("GOOGLE_SHEET_ID is not set");
  const token = await serviceAccountToken(KEY);
  const meta = await google("GET", "?fields=properties.title,sheets.properties", token) as
    { properties: { title: string }; sheets: { properties: { sheetId: number; title: string } }[] };
  const tab = meta.sheets[0].properties;
  console.log(`sheet: "${meta.properties.title}", first tab "${tab.title}"`);
  const first = await google("GET", `/values/${encodeURIComponent(`'${tab.title}'!A1:F1`)}`, token) as { values?: string[][] };
  if (first.values?.[0]?.some((c) => c.trim())) {
    console.log(`row 1 already has: ${first.values[0].join(" | ")} — left as it is`);
    return;
  }
  await google("POST", ":batchUpdate", token, { requests: [
    { updateCells: { start: { sheetId: tab.sheetId, rowIndex: 0, columnIndex: 0 }, fields: "userEnteredValue,userEnteredFormat.textFormat.bold",
      rows: [{ values: HEADER.map((t) => ({ userEnteredValue: { stringValue: t }, userEnteredFormat: { textFormat: { bold: true } } })) }] } },
    { updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
  ] });
  console.log(`header written: ${HEADER.join(" | ")}`);
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });

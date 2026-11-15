// Google Sheets for the volunteers' shelter sheet. No LLM: the columns are known.
//
// Two ways in, chosen by what is in .env.local:
//   read + write  GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_FILE (a service account JSON key, kept
//                 in agents/.secrets/, git-ignored). The sheet is shared with the account's email.
//   read only     GOOGLE_SHEET_CSV_URL: the sheet published to the web as CSV ("File → Share →
//                 Publish to web"). Google refreshes it about every 5 minutes. A local .csv path
//                 also works, for testing.
// Calls the Sheets REST API with fetch and signs the service account token with node:crypto,
// so there is no extra package.

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export interface SheetRow {
  row: number;             // 1-based sheet row
  shelter: string;
  used?: number;
  total?: number;
  source?: string;
  updated?: string;
  note?: string;
}

type Col = "shelter" | "used" | "total" | "source" | "updated" | "note";
// Header names we recognise, Turkish and English. Matched on the start of the header text.
const HEADER: Record<Col, RegExp> = {
  shelter: /^(barınak|barinak|shelter|name|ad)/i,
  used: /^(dolu|used|beds used|occupied)/i,
  total: /^(kapasite|toplam|total|capacity|beds total)/i,
  source: /^(kaynak|source)/i,
  updated: /^(güncelleme|guncelleme|updated|saat|time)/i,
  note: /^(not|note)/i,
};

export interface Sheet {
  mode: "api" | "csv";
  canWrite: boolean;
  read(): Promise<{ rows: SheetRow[]; columns: Partial<Record<Col, number>> }>;
  /** Set some cells of one row. Columns the sheet does not have are skipped. */
  writeRow(row: number, values: Partial<Record<Col, string | number>>): Promise<void>;
  appendRow(values: Partial<Record<Col, string | number>>): Promise<void>;
}

export function sheetFromEnv(): Sheet | undefined {
  const id = process.env.GOOGLE_SHEET_ID;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (id && key) return apiSheet(id, key, process.env.GOOGLE_SHEET_TAB ?? "");
  const csv = process.env.GOOGLE_SHEET_CSV_URL;
  if (csv) return csvSheet(csv);
  return undefined;
}

// ---------- parsing, shared ----------

function parseTable(values: string[][]): { rows: SheetRow[]; columns: Partial<Record<Col, number>> } {
  const header = values[0] ?? [];
  const columns: Partial<Record<Col, number>> = {};
  header.forEach((h, i) => {
    for (const [col, re] of Object.entries(HEADER) as [Col, RegExp][]) {
      if (columns[col] === undefined && re.test(h.trim())) columns[col] = i;
    }
  });
  if (columns.shelter === undefined || columns.used === undefined || columns.total === undefined) {
    throw new Error(`sheet header must have shelter, used and total columns (e.g. "Barınak | Dolu | Kapasite"); found: ${header.join(" | ")}`);
  }
  const num = (v: string | undefined) => {
    const n = Number((v ?? "").replace(/[^\d.-]/g, ""));
    return (v ?? "").trim() !== "" && Number.isFinite(n) ? Math.round(n) : undefined;
  };
  const cell = (r: string[], c: Col) => (columns[c] === undefined ? undefined : (r[columns[c]!] ?? "").trim() || undefined);
  const rows = values.slice(1).map((r, i) => ({
    row: i + 2,
    shelter: cell(r, "shelter") ?? "",
    used: num(cell(r, "used")), total: num(cell(r, "total")),
    source: cell(r, "source"), updated: cell(r, "updated"), note: cell(r, "note"),
  })).filter((r) => r.shelter);
  return { rows, columns };
}

/** Minimal CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

// ---------- read only: published CSV or a local file ----------

function csvSheet(urlOrPath: string): Sheet {
  return {
    mode: "csv", canWrite: false,
    async read() {
      const text = /^https?:/.test(urlOrPath)
        ? await (await fetch(urlOrPath, { signal: AbortSignal.timeout(15_000), cache: "no-store" })).text()
        : readFileSync(urlOrPath, "utf8");
      return parseTable(parseCsv(text));
    },
    async writeRow() { throw new Error("read-only sheet (published CSV): set GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_FILE to write"); },
    async appendRow() { throw new Error("read-only sheet (published CSV)"); },
  };
}

// ---------- read + write: Sheets API with a service account ----------

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64url");
}

const tokens = new Map<string, { value: string; until: number }>();

/** OAuth access token for a service account key file (JWT bearer grant, signed with node:crypto). */
export async function serviceAccountToken(keyFile: string, scope = "https://www.googleapis.com/auth/spreadsheets"): Promise<string> {
  const hit = tokens.get(`${keyFile}|${scope}`);
  if (hit && Date.now() < hit.until) return hit.value;
  if (!existsSync(keyFile)) throw new Error(`GOOGLE_SERVICE_ACCOUNT_FILE not found: ${keyFile}`);
  const sa = JSON.parse(readFileSync(keyFile, "utf8")) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud, iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key).toString("base64url");
  const res = await fetch(aud, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(`${keyFile}|${scope}`, { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 });
  return j.access_token;
}

function apiSheet(id: string, keyFile: string, tab: string): Sheet {
  let columns: Partial<Record<Col, number>> = {};
  let sheetTitle = tab;
  const accessToken = () => serviceAccountToken(keyFile);

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, {
      method, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Sheets ${method} ${path.split("?")[0]} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  async function title(): Promise<string> {
    if (sheetTitle) return sheetTitle;
    const meta = (await call("GET", "?fields=sheets.properties.title")) as { sheets: { properties: { title: string } }[] };
    sheetTitle = meta.sheets[0].properties.title; // the first tab
    return sheetTitle;
  }
  const range = async (a1: string) => encodeURIComponent(`'${(await title()).replace(/'/g, "''")}'!${a1}`);
  const letter = (i: number) => String.fromCharCode(65 + i);

  function toCells(values: Partial<Record<Col, string | number>>): [number, string | number][] {
    return (Object.entries(values) as [Col, string | number][])
      .filter(([c]) => columns[c] !== undefined).map(([c, v]) => [columns[c]!, v]);
  }

  return {
    mode: "api", canWrite: true,
    async read() {
      const r = (await call("GET", `/values/${await range("A1:Z500")}`)) as { values?: string[][] };
      const parsed = parseTable(r.values ?? []);
      columns = parsed.columns;
      return parsed;
    },
    async writeRow(row, values) {
      const cells = toCells(values);
      if (!cells.length) return;
      await call("POST", "/values:batchUpdate", {
        valueInputOption: "USER_ENTERED",
        data: await Promise.all(cells.map(async ([c, v]) => ({ range: decodeURIComponent(await range(`${letter(c)}${row}`)), values: [[v]] }))),
      });
    },
    async appendRow(values) {
      const width = Math.max(...Object.values(columns).map((c) => c ?? 0)) + 1;
      const line: (string | number)[] = Array(width).fill("");
      for (const [c, v] of toCells(values)) line[c] = v;
      await call("POST", `/values/${await range("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: [line] });
    },
  };
}

/** For matching a sheet row to a desk shelter: lowercase, no punctuation, Turkish letters folded. */
export function normName(s: string): string {
  return s.toLocaleLowerCase("tr").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

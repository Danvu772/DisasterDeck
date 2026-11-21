// check:scenario-lint. Offline lint of data/scenarios/antakya-demo (D-0017 §4, issue #53). No database.
// Every body passes eventBody and a strict local check of `origin` (D-0017 §2), and the files are
// consistent with each other: keys, coordinates, phones, cast references, beats. The full
// play-through is check:scenario (a later issue). Run: npm run check:scenario-lint
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { haversineMeters, normalizeAddress } from "./geo";
import { answerPayload, approvalPayload, correctionPayload, eventBody, incidentPayload } from "./schemas";

type Obj = Record<string, unknown>;
const dir = fileURLToPath(new URL("../../data/scenarios/antakya-demo/", import.meta.url));
const root = fileURLToPath(new URL("../../data/", import.meta.url));
const errors: string[] = [];
const fail = (msg: string) => { if (errors.length < 60) errors.push(msg); else if (errors.length === 60) errors.push("... more"); };
const json = (file: string, base = dir): unknown => JSON.parse(readFileSync(base + file, "utf8"));
const jsonl = (file: string): unknown[] =>
  readFileSync(dir + file, "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { fail(`${file}:${i + 1} is not JSON`); return {}; }
  });
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const onlyKeys = (o: Obj, allowed: string[], where: string) => {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${where}: unknown field "${k}"`);
};

// ---- header, pilot, seed ----
const header = json("header.json") as Obj;
const pilot = json("pilot.json", root) as { bbox: number[]; imageryBbox: number[] };
const seed = json("seed.json", root) as { users: { _id: string; role: string }[] };
const users = new Map(seed.users.map((u) => [u._id, u.role]));
const T0 = Date.parse(String(header.t0));
const SPAN = Number(header.spanS);
if (header.id !== "antakya-demo" || header.synthetic !== true || Number.isNaN(T0) || !(SPAN > 0) || typeof header.title !== "string") fail("header.json: id, t0, spanS, synthetic, title");
const inBox = (c: number[], b: number[]) => c[0] >= b[1] && c[0] <= b[3] && c[1] >= b[0] && c[1] <= b[2]; // coords are [lat, lng]

// ---- tracks ----
const TRACKS = ["x", "instagram", "facebook", "ap"] as const;
const SOURCE_OF: Record<string, string> = { x: "x", instagram: "instagram", facebook: "facebook", ap: "news" };
const KINDS: Record<string, string[]> = { x: ["post", "repost"], instagram: ["post", "repost", "story"], facebook: ["group_post", "post"], ap: ["wire"] };
const ORIGIN_KEYS = ["postId", "author", "kind", "url", "metrics", "media", "slug", "urgency"];
const BODY_KEYS = ["type", "source", "actor", "observedAt", "dedupeKey", "origin", "payload"];

interface Line { track: string; atS: number; beat: number; body: Obj; where: string }
const lines: Line[] = [];
const byKey = new Map<string, Line>();

function checkOrigin(l: Line) {
  const o = l.body.origin;
  if (!isObj(o)) return fail(`${l.where}: origin is missing`);
  onlyKeys(o, ORIGIN_KEYS, `${l.where} origin`);
  for (const k of ["postId", "author", "kind", "url"]) if (typeof o[k] !== "string" || !o[k]) fail(`${l.where}: origin.${k} must be a non-empty string`);
  if (typeof o.kind === "string" && !KINDS[l.track].includes(o.kind)) fail(`${l.where}: origin.kind "${o.kind}" is not valid for ${l.track}`);
  try {
    const u = new URL(String(o.url));
    if (u.protocol !== "https:" || !u.hostname.endsWith(".example")) fail(`${l.where}: origin.url must be https on *.example`);
  } catch { fail(`${l.where}: origin.url is not a URL`); }
  if (o.metrics !== undefined && (!isObj(o.metrics) || Object.values(o.metrics).some((v) => typeof v !== "number"))) fail(`${l.where}: origin.metrics must be numbers`);
  if (o.media !== undefined) {
    if (l.track !== "instagram" && l.track !== "x") fail(`${l.where}: origin.media is for instagram posts`);
    if (!Array.isArray(o.media) || !o.media.every((m) => isObj(m) && m.type === "image" && typeof m.url === "string" && (m.url.startsWith("/demo/") || /^https:\/\/[^/]+\.example\//.test(m.url)))) fail(`${l.where}: origin.media must be [{type:"image",url:"/demo/..."}]`);
  }
  if (l.track === "ap") {
    if (typeof o.slug !== "string" || !["urgent", "bulletin", "flash"].includes(String(o.urgency))) fail(`${l.where}: AP origin needs slug and urgency (urgent|bulletin|flash)`);
  } else if (o.slug !== undefined || o.urgency !== undefined) fail(`${l.where}: slug and urgency are AP only`);
}

const textsOf = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textsOf(x, out));
  else if (isObj(v)) Object.values(v).forEach((x) => textsOf(x, out));
  return out;
};

function checkPhones(where: string, v: unknown) {
  for (const t of textsOf(v)) {
    if (/\d{10,}/.test(t)) fail(`${where}: a run of 10 or more digits (phone?): ${t.slice(0, 50)}`);
    if (/(\+?\d[\d\s().-]{7,}\d)/.test(t.replace(/•+\d{2}/g, ""))) fail(`${where}: looks like an unmasked phone number: ${t.slice(0, 50)}`);
    if (/\b(tel|phone|telefon)\.?:?\s*(?!•)\S*\d/i.test(t)) fail(`${where}: a phone given after Tel/Phone is not masked`);
  }
}

for (const track of TRACKS) {
  jsonl(`${track}.jsonl`).forEach((raw, i) => {
    const where = `${track}.jsonl:${i + 1}`;
    if (!isObj(raw) || !isObj(raw.body) || !Number.isInteger(raw.atS) || !Number.isInteger(raw.beat)) return fail(`${where}: needs integer atS, integer beat and a body`);
    onlyKeys(raw, ["atS", "beat", "body"], where);
    const l: Line = { track, atS: raw.atS as number, beat: raw.beat as number, body: raw.body, where };
    lines.push(l);
    const b = l.body;
    onlyKeys(b, BODY_KEYS, `${where} body`);
    const parsed = eventBody.safeParse(b);
    if (!parsed.success) fail(`${where}: eventBody rejects it: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    if (b.source !== SOURCE_OF[track]) fail(`${where}: source must be ${SOURCE_OF[track]}`);
    if (track === "ap" ? b.actor !== "ap" : typeof b.actor !== "string" || !b.actor.startsWith(`${b.source}:@`) && !b.actor.startsWith(`${b.source}:`)) fail(`${where}: actor`);
    if (l.atS < 0 || l.atS > SPAN) fail(`${where}: atS ${l.atS} is outside 0..${SPAN}`);
    if (b.observedAt !== new Date(T0 + l.atS * 1000).toISOString().replace(".000Z", "Z")) fail(`${where}: observedAt must be T0 + atS`);
    const key = b.dedupeKey;
    if (typeof key !== "string" || !key.startsWith(`${b.source}:`)) fail(`${where}: dedupeKey must start with "${b.source}:"`);
    else {
      if (/:run/i.test(key)) fail(`${where}: dedupeKey must not carry a runId`);
      if (byKey.has(key)) fail(`${where}: dedupeKey ${key} is not unique (also ${byKey.get(key)!.where})`);
      byKey.set(key, l);
    }
    checkOrigin(l);
    checkPhones(where, b.payload);
    const p = isObj(b.payload) ? b.payload : {};
    if (b.type === "report" && (typeof p.text !== "string" || typeof p.textEn !== "string" || !p.textEn)) fail(`${where}: a report needs text and textEn`);
    if (typeof p.phoneMasked === "string" && !/^•{9}\d{2}$/.test(p.phoneMasked)) fail(`${where}: phoneMasked must be •••••••••NN`);
    if (b.type === "capacity" && (typeof p.photoUrl !== "string" || !p.photoUrl.startsWith("https://instagram.example/"))) fail(`${where}: a shelter post needs photoUrl on https://instagram.example/`);
    if (b.type === "need") {
      if (!/^[a-z ]+$/.test(String(p.item))) fail(`${where}: need item must be lowercase English`);
      if (b.source === "news") fail(`${where}: AP has no needs`);
    }
    if (b.type === "report" && b.source === "news") {
      if (p.kind !== "site_update" || p.address || p.coords) fail(`${where}: an AP item is a site_update with no place`);
    }
    if (isObj(raw.body) && typeof p.text === "string" && p.text.length > 600 && track !== "facebook") fail(`${where}: too long for ${track}`);
    if (b.source !== "news" && b.type === "report" && /[A-Za-z]/.test(String(p.textEn)) === false) fail(`${where}: textEn is empty of words`);
    // coordinates
    const c = p.coords;
    if (Array.isArray(c)) {
      const cc = c as number[];
      if (!inBox(cc, pilot.bbox)) fail(`${where}: coords outside the pilot bbox`);
      if (l.beat >= 2 && l.beat <= 16 && !inBox(cc, pilot.imageryBbox)) fail(`${where}: beats 2 to 16 must sit inside imageryBbox`);
    }
  });
}
const sorted = [...lines].sort((a, b) => a.atS - b.atS);
for (const t of TRACKS) {
  const own = lines.filter((l) => l.track === t);
  own.forEach((l, i) => { if (i && own[i - 1].atS > l.atS) fail(`${l.where}: track is not in time order`); });
}
let prev = 0;
for (const l of sorted) { if (l.beat < prev) fail(`${l.where}: beat ${l.beat} comes after beat ${prev} in time`); prev = Math.max(prev, l.beat); }

// two reports that must be two sites must sit more than 100 m apart; the same address must merge
const placed = lines.filter((l) => l.body.type === "report" && isObj(l.body.payload) && ["trapped", "missing"].includes(String(l.body.payload.kind)) && Array.isArray(l.body.payload.coords));
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  const a = placed[i].body.payload as Obj, b = placed[j].body.payload as Obj;
  const same = normalizeAddress(String(a.address)) === normalizeAddress(String(b.address));
  const m = haversineMeters(a.coords as [number, number], b.coords as [number, number]);
  if (same && m > 100) fail(`${placed[j].where}: same address as ${placed[i].where} but ${Math.round(m)} m away, the keeper would make a second site`);
  if (!same && m <= 100) fail(`${placed[j].where}: ${Math.round(m)} m from ${placed[i].where} with another address, the keeper would merge them`);
}

// ---- cast ----
const castRaw = jsonl("cast.jsonl");
const castIds = new Map<string, number>();
const DO = ["accept", "en_route", "arrived", "done", "decline", "problem", "approve", "correct", "go_dark"];
const ANSWER: Record<string, Obj> = { accept: { result: "accepted" }, en_route: { result: "accepted", progress: "en_route" }, arrived: { result: "accepted", progress: "arrived" }, done: { result: "done" }, decline: { result: "declined" } };
const TASK_TYPES = ["call", "rescue", "deliver", "notify", "assist", "evacuate"];
const cast: { atS: number; beat: number; id: string; line: Obj }[] = [];
const ref = (s: string, where: string, atS: number): void => {
  const key = s.replace(/^@record:/, "");
  const l = byKey.get(key);
  if (l) { if (l.atS > atS) fail(`${where}: refers to ${key}, which plays later`); return; }
  const c = castIds.get(key);
  if (c === undefined) return fail(`${where}: ${key} is not a line in the scenario`);
  if (c > atS) fail(`${where}: refers to cast ${key}, which plays later`);
};
castRaw.forEach((raw, i) => {
  const where = `cast.jsonl:${i + 1}`;
  if (!isObj(raw) || !Number.isInteger(raw.atS) || !Number.isInteger(raw.beat) || typeof raw.id !== "string") return fail(`${where}: needs atS, beat, id`);
  if (castIds.has(raw.id)) fail(`${where}: duplicate cast id ${raw.id}`);
  castIds.set(raw.id, raw.atS as number);
  cast.push({ atS: raw.atS as number, beat: raw.beat as number, id: raw.id, line: raw });
});
let prevCast = 0;
for (const { atS, beat, id, line } of cast) {
  const where = `cast ${id}`;
  onlyKeys(line, ["atS", "beat", "id", "as", "do", "task", "payload"], where);
  if (atS < 0 || atS > SPAN) fail(`${where}: atS outside the span`);
  if (atS < prevCast) fail(`${where}: cast is not in time order`);
  prevCast = atS;
  const as = String(line.as), doo = String(line.do);
  if (!DO.includes(doo)) fail(`${where}: unknown do "${doo}"`);
  if (as !== "assignee" && !users.has(as)) fail(`${where}: "as" is neither assignee nor a seeded user`);
  const task = line.task;
  if (task !== undefined) {
    if (!isObj(task)) fail(`${where}: task must be an object`);
    else {
      onlyKeys(task, ["fromEvent", "type", "status"], `${where} task`);
      if (typeof task.fromEvent !== "string" || !byKey.has(task.fromEvent)) fail(`${where}: task.fromEvent does not point at a line`);
      else if (byKey.get(task.fromEvent)!.atS > atS) fail(`${where}: task.fromEvent plays later than the cast line`);
      if (task.type !== undefined && !TASK_TYPES.includes(String(task.type))) fail(`${where}: task.type`);
    }
  }
  if (as === "assignee" && !task) fail(`${where}: "assignee" needs a task`);
  if (["accept", "en_route", "arrived", "done", "decline", "approve"].includes(doo) && !task) fail(`${where}: ${doo} needs a task`);
  if (doo === "approve" && users.get(as) !== "coordinator") fail(`${where}: approve is by a coordinator`);
  if (doo === "go_dark" && (as === "assignee" || !users.has(as))) fail(`${where}: go_dark names a seeded user`);
  const payload = isObj(line.payload) ? { ...line.payload } : {};
  for (const k of ["recordId", "incidentId"]) {
    const v = payload[k];
    if (typeof v === "string" && v.startsWith("@record:")) { ref(v, where, atS); payload[k] = "placeholder"; }
  }
  const check = (r: { success: boolean; error?: { issues: { message: string }[] } }, what: string) => { if (!r.success) fail(`${where}: payload is not a valid ${what}: ${r.error?.issues[0]?.message}`); };
  if (doo in ANSWER) check(answerPayload.safeParse({ taskId: "t", ...ANSWER[doo], ...payload }), "answer");
  else if (doo === "problem") check(incidentPayload.safeParse({ taskId: "t", ...payload }), "incident");
  else if (doo === "approve") check(approvalPayload.safeParse({ taskId: "t", approved: true, ...payload }), "approval");
  else if (doo === "correct") {
    check(correctionPayload.safeParse(payload), "correction");
    if (isObj(payload.fields) && Array.isArray(payload.fields.coords) && !inBox(payload.fields.coords as number[], pilot.bbox)) fail(`${where}: coords outside the bbox`);
    if (isObj(payload.fields) && Array.isArray(payload.fields.coords) && beat >= 2 && beat <= 16 && !inBox(payload.fields.coords as number[], pilot.imageryBbox)) fail(`${where}: coords outside imageryBbox`);
  } else if (line.payload !== undefined && doo === "go_dark") fail(`${where}: go_dark takes no payload`);
  if (Array.isArray(payload.coords) && !inBox(payload.coords as number[], pilot.bbox)) fail(`${where}: coords outside the bbox`);
  checkPhones(where, payload);
}

// ---- beats ----
const beats = json("beats.json") as unknown[];
const COLLS = ["sites", "needs", "roads", "shelters", "incidents", "tasks", "events", "inbox", "users", "zones"];
const EVENT_COLL: Record<string, string> = { report: "sites", need: "needs", closure: "roads", capacity: "shelters" };
const EV_STATUS = ["pending", "working", "done", "merged", "rejected", "failed"];
if (!Array.isArray(beats) || beats.length !== 24) fail("beats.json: expected beats 0 to 23");
let lastAt = -1;
(beats as Obj[]).forEach((b, i) => {
  const where = `beats.json beat ${i}`;
  if (!isObj(b) || b.beat !== i) return fail(`${where}: beats must be numbered 0..23 in order`);
  onlyKeys(b, ["beat", "name", "afterLine", "shows", "expect", "settleS"], where);
  if (typeof b.name !== "string" || typeof b.shows !== "string" || !b.name || !b.shows) fail(`${where}: name and shows`);
  if (!Array.isArray(b.expect) || !b.expect.length) fail(`${where}: expect must not be empty`);
  const mine = lines.filter((l) => l.beat === i).length + cast.filter((c) => c.beat === i).length;
  if (i > 0 && mine === 0) fail(`${where}: no line has this beat`);
  if (i === 0 && b.afterLine !== null) fail(`${where}: beat 0 has no line, afterLine is null`);
  if (i > 0) {
    const al = String(b.afterLine);
    const [track, ...rest] = al.split(":");
    const key = rest.join(":");
    let at: number | undefined, beat: number | undefined;
    if (track === "cast") { const c = cast.find((x) => x.id === key); at = c?.atS; beat = c?.beat; }
    else { const l = byKey.get(key); if (l?.track === track) { at = l.atS; beat = l.beat; } }
    if (at === undefined) fail(`${where}: afterLine "${al}" is not a line`);
    else {
      if (beat !== i) fail(`${where}: afterLine belongs to beat ${beat}`);
      if (at < lastAt) fail(`${where}: afterLine is earlier than the previous beat's`);
      lastAt = at;
      const next = [...lines.map((l) => l.atS), ...cast.map((c) => c.atS)].filter((t) => t > at!).sort((a, c) => a - c)[0];
      if (b.settleS !== undefined && (typeof b.settleS !== "number" || b.settleS < 0 || (next !== undefined && at + b.settleS >= next))) fail(`${where}: settleS must fit before the next line`);
    }
  }
  (Array.isArray(b.expect) ? b.expect : []).forEach((e: unknown, j: number) => {
    const w = `${where} expect ${j}`;
    if (!isObj(e) || Object.keys(e).length !== 1) return fail(`${w}: one operator per entry`);
    const [op, v] = Object.entries(e)[0];
    if (!isObj(v)) return fail(`${w}: ${op} takes an object`);
    const fromKey = (k: unknown, coll?: string) => {
      const l = typeof k === "string" ? byKey.get(k) : undefined;
      if (!l) return fail(`${w}: "${String(k)}" is not a line`);
      if (coll && EVENT_COLL[String(l.body.type)] !== coll) fail(`${w}: a ${l.body.type} event makes no ${coll} record`);
    };
    if (op === "count") {
      onlyKeys(v, ["coll", "where", "eq", "gte"], w);
      if (!COLLS.includes(String(v.coll)) || !isObj(v.where) || (("eq" in v) === ("gte" in v)) || typeof (v.eq ?? v.gte) !== "number") fail(`${w}: count needs coll, where and one of eq or gte`);
    } else if (op === "record") {
      onlyKeys(v, ["coll", "from", "is"], w);
      if (!COLLS.includes(String(v.coll)) || !isObj(v.is) || !Object.keys(v.is).length) fail(`${w}: record needs coll and is`);
      fromKey(v.from, String(v.coll));
    } else if (op === "event") {
      onlyKeys(v, ["key", "status"], w);
      fromKey(v.key);
      if (!EV_STATUS.includes(String(v.status))) fail(`${w}: event status`);
    } else if (op === "inbox") {
      onlyKeys(v, ["user", "match", "min"], w);
      const asker = lines.some((l) => l.body.actor === v.user); // a social asker (needs notices go to the actor id)
      if (!(users.has(String(v.user)) || asker) || typeof v.match !== "string" || !(Number(v.min) >= 1)) fail(`${w}: inbox needs a seeded user or a line actor, match and min`);
    } else if (op === "task") {
      onlyKeys(v, ["from", "type", "is"], w);
      if (!isObj(v.is) || (v.type !== undefined && !TASK_TYPES.includes(String(v.type)))) fail(`${w}: task needs is, and a valid type`);
      fromKey(v.from);
    } else fail(`${w}: unknown operator ${op}`);
  });
});

// ---- report ----
const n = (t: string) => lines.filter((l) => l.track === t).length;
console.log(`antakya-demo: x ${n("x")}, instagram ${n("instagram")}, facebook ${n("facebook")}, ap ${n("ap")}, cast ${cast.length}, beats ${(beats as unknown[]).length}`);
if (errors.length) {
  console.error(errors.map((e) => `FAIL ${e}`).join("\n"));
  process.exit(1);
}
console.log("OK: every body passes eventBody and the origin check; keys, coordinates, phones, cast references and beats are consistent");

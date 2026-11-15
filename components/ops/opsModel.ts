// What /ops draws, from either source: the live events feed (fromEvents) or the replayed
// exercise posts (fixtures/opsPosts.ts). Pure functions, no React, no colours of their own.
import type { CapacityPayload, ClosurePayload, Event, LatLng, NeedPayload, ReportPayload, Tier } from "@/lib/types";
import type { MetricPoint } from "../metrics/types";
import { LOCAL_OFFSET_MIN, QUAKE_AT, type NeedItem, type OpsPost, type Outcome } from "@/fixtures/opsPosts";

const RESEARCH = new Set(["x", "news", "instagram", "facebook", "reddit", "sheet"]);
const SOURCE_WORD: Record<string, string> = { x: "X", news: "News", instagram: "IG", facebook: "FB", reddit: "Reddit", sheet: "Sheet" };

// Live desk: every research-agent event becomes one stream line, with what the Brain made of it.
// Oldest first, like the replay. "merged" is a copy only for a report: a merged shelter, road or
// need update is still that shelter, road or need (it updated the record the desk already had).
export function fromEvents(events: Event[]): OpsPost[] {
  return events
    .filter((e) => RESEARCH.has(e.source) && ["report", "need", "closure", "capacity"].includes(e.type))
    .map((e) => {
      const p = e.payload as Partial<ReportPayload & NeedPayload & ClosurePayload & CapacityPayload>;
      const record = e.result?.recordIds?.[0] ?? "";
      let outcome: Outcome;
      if (e.status === "pending" || e.status === "working") outcome = { kind: "pending" };
      else if (e.status === "rejected" || e.status === "failed") outcome = { kind: "none", why: e.result?.reason ?? "no record" };
      else if (e.status === "merged" && e.type === "report") outcome = { kind: "copy", site: record, counted: true };
      else if (e.type === "report" && p.kind === "rescued") outcome = { kind: "rescued", site: record, people: p.peopleCount ?? 1 };
      else if (e.type === "report") outcome = { kind: "site", site: record, people: p.peopleCount ?? 1 };
      else if (e.type === "need") outcome = { kind: "need", item: (p.item ?? "supplies") as NeedItem, quantity: p.quantity ?? 1, unit: "", lifeThreatening: !!p.lifeThreatening };
      else if (e.type === "closure") outcome = { kind: "road", road: p.road ?? "a road", state: p.state ?? "unconfirmed" };
      else outcome = { kind: "shelter", name: p.shelter ?? "a shelter", used: p.bedsUsed ?? 0, total: p.bedsTotal ?? 0 };
      return {
        id: e._id ?? e.dedupeKey ?? String(e.ts),
        at: new Date(e.observedAt ?? e.ts).toISOString(),
        author: `${SOURCE_WORD[e.source] ?? e.source} post`,
        text: p.text ?? p.road ?? p.shelter ?? p.item ?? "",
        textEn: p.textEn ?? "",
        district: p.region ?? "",
        coords: p.coords,
        outcome,
      };
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// ---------- One line per post ----------

const QTY = (o: Extract<Outcome, { kind: "need" }>) => `${o.quantity}${o.unit ? ` ${o.unit} of` : ""} ${o.item}`;

// "Site 12" reads well; a live record key does not, so it never reaches the screen.
const NAMED = (s: string) => /^Site \d+$/.test(s);
const SITE = (s: string) => (NAMED(s) ? s : "the site");
const WHY = (s: string) => s.replaceAll("_", " ");

export function outcomeText(o: Outcome): string {
  switch (o.kind) {
    case "site": return `${NAMED(o.site) ? `${o.site} opened` : "New site"}, ${o.people} trapped. A volunteer calls back.`;
    case "copy": return o.counted ? `Merged into ${SITE(o.site)}, one more person asking.` : `Same person again about ${SITE(o.site)}. Not counted.`;
    case "need": return `Need filed: ${QTY(o)}${o.lifeThreatening ? ", life-threatening" : ""}.`;
    case "shelter": return `${o.name}: ${o.used} of ${o.total} beds.`;
    case "road": return `Road ${o.state}: ${o.road}.`;
    case "rescued": return `${SITE(o.site)} closed, ${o.people} rescued alive.`.replace(/^the/, "The");
    case "hazard": return `Hazard at ${SITE(o.site)}: ${o.hazard}. Teams warned.`;
    case "unclear": return `Needs a call: ${WHY(o.why)}.`;
    case "held": return `Held: ${WHY(o.why)}.`;
    case "none": return `No record: ${WHY(o.why)}.`;
    case "pending": return "Processing.";
  }
}

export const OUTCOME_TAG: Record<Outcome["kind"], string> = {
  site: "New site", copy: "Merged", need: "Need", shelter: "Shelter", road: "Road", rescued: "Rescued",
  hazard: "Hazard", unclear: "Needs a call", held: "Held", none: "No record", pending: "Processing",
};

// Tier bar for the line. Red only where a person should act now.
export function outcomeTier(o: Outcome): { tier: Tier; actNow: boolean } {
  if (o.kind === "site" || o.kind === "hazard") return { tier: 0, actNow: true };
  if (o.kind === "need") return { tier: o.lifeThreatening ? 0 : 1, actNow: o.lifeThreatening };
  if (o.kind === "road" || o.kind === "held" || o.kind === "unclear") return { tier: 1, actNow: false };
  if (o.kind === "shelter") return { tier: o.used >= o.total * 0.9 ? 1 : 2, actNow: false };
  return { tier: 2, actNow: false };
}

// "06:52", local time in Türkiye.
export function localTime(iso: string): string {
  const t = Math.floor(Date.parse(iso) / 60_000) + LOCAL_OFFSET_MIN;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(((t % 60) + 60) % 60).padStart(2, "0")}`;
}
export const minutesAfterQuake = (iso: string) => Math.max(0, Math.round((Date.parse(iso) - Date.parse(QUAKE_AT)) / 60_000));

// ---------- The numbers ----------

export interface Quake { id: string; time: string; mag: number; place: string; lat: number; lon: number }

export interface OpsSummary {
  read: number; records: number; copies: number; trappedOpen: number; rescued: number;
  held: number; notRequest: number; sitesOpen: number;
  byOutcome: MetricPoint[]; needs: MetricPoint[]; districts: MetricPoint[]; shelters: MetricPoint[];
  perHour: { label: string; posts: number; quakes: number }[];
}

const NEED_ORDER: NeedItem[] = ["insulin", "blankets", "heaters", "tents", "water", "baby formula", "hot meals", "diesel"];

// live: the posts are from today, not from the 2023 scenario, so the hours are the last 12 hours
// of posts (by local time) and the aftershock row stays empty.
export function summarize(posts: OpsPost[], quakes: Quake[], { live = false } = {}): OpsSummary {
  const sites = new Map<string, { people: number; open: boolean; district: string }>();
  const needQty = new Map<string, { q: number; unit: string; life: boolean }>();
  const shelters = new Map<string, { used: number; total: number }>();
  const count: Partial<Record<Outcome["kind"], number>> = {};
  let rescued = 0;
  for (const p of posts) {
    const o = p.outcome;
    count[o.kind] = (count[o.kind] ?? 0) + 1;
    if (o.kind === "site") sites.set(o.site, { people: o.people, open: true, district: p.district });
    if (o.kind === "rescued") { const s = sites.get(o.site); if (s) s.open = false; rescued += o.people; }
    if (o.kind === "need") {
      const cur = needQty.get(o.item) ?? { q: 0, unit: o.unit, life: o.lifeThreatening };
      needQty.set(o.item, { ...cur, q: cur.q + o.quantity });
    }
    if (o.kind === "shelter") shelters.set(o.name, { used: o.used, total: o.total });
  }
  const open = [...sites.values()].filter((s) => s.open);
  const n = (k: Outcome["kind"]) => count[k] ?? 0;

  const byOutcome: MetricPoint[] = [
    { label: "New trapped-person sites", value: n("site"), tone: "act" },
    { label: "Copies merged into a site", value: n("copy"), tone: "ink" },
    { label: "Needs filed", value: n("need"), tone: "warn" },
    { label: "Rescued, sites closed", value: n("rescued"), tone: "calm" },
    { label: "Roads and shelters", value: n("road") + n("shelter"), tone: "calm" },
    { label: "Held or needs a call", value: n("held") + n("unclear"), tone: "warn" },
    { label: "Not a request", value: n("none"), tone: "calm" },
  ];

  const needs: MetricPoint[] = NEED_ORDER.filter((k) => needQty.has(k)).map((k) => {
    const v = needQty.get(k)!;
    return { label: k, value: v.q, tone: v.life ? "act" : "warn", note: v.unit ? `${v.unit}` : undefined };
  });

  const byDistrict = new Map<string, { open: number; saved: number }>();
  for (const s of sites.values()) {
    const d = byDistrict.get(s.district) ?? { open: 0, saved: 0 };
    if (s.open) d.open += s.people; else d.saved += s.people;
    byDistrict.set(s.district, d);
  }
  const districts: MetricPoint[] = [...byDistrict.entries()]
    .sort((a, b) => b[1].open + b[1].saved - (a[1].open + a[1].saved))
    .slice(0, 8)
    .map(([label, d]) => ({ label, value: d.open, tone: "act", note: d.saved ? `${d.saved} already rescued` : undefined }));

  const shelterPts: MetricPoint[] = [...shelters.entries()].map(([label, s]) => ({
    label, value: s.used, max: s.total, tone: s.used >= s.total * 0.9 ? "warn" : "calm",
  }));

  const H = 3_600_000;
  let perHour: OpsSummary["perHour"];
  if (live && posts.length) {
    const end = Math.floor(Date.parse(posts[posts.length - 1].at) / H) * H;
    const start = Math.max(Math.floor(Date.parse(posts[0].at) / H) * H, end - 11 * H);
    perHour = Array.from({ length: (end - start) / H + 1 }, (_, h) => ({
      label: localTime(new Date(start + h * H).toISOString()).slice(0, 2),
      posts: posts.filter((p) => Math.floor((Date.parse(p.at) - start) / H) === h).length,
      quakes: 0,
    }));
  } else {
    const lastMin = posts.length ? minutesAfterQuake(posts[posts.length - 1].at) : 0;
    const hours = Math.max(1, Math.min(12, Math.floor(lastMin / 60) + 1));
    perHour = Array.from({ length: hours }, (_, h) => ({
      label: localTime(new Date(Date.parse(QUAKE_AT) + h * H).toISOString()).slice(0, 2),
      posts: posts.filter((p) => Math.floor(minutesAfterQuake(p.at) / 60) === h).length,
      quakes: quakes.filter((q) => q.mag >= 5 && Math.floor(minutesAfterQuake(q.time) / 60) === h).length,
    }));
  }

  return {
    read: posts.length,
    records: n("site") + n("need") + n("road") + n("shelter") + n("rescued") + n("hazard"),
    copies: n("copy"),
    trappedOpen: open.reduce((s, x) => s + x.people, 0),
    rescued,
    held: n("held") + n("unclear"),
    notRequest: n("none"),
    sitesOpen: open.length,
    byOutcome, needs, districts, shelters: shelterPts, perHour,
  };
}

// ---------- What the map pins ----------

export interface OpsPin {
  key: string; coords: LatLng; kind: "site" | "need" | "road" | "shelter";
  tier: Tier; actNow: boolean; support: number; closed: boolean; label: string;
}

// One pin per site (copies make it bigger, a rescue greys it), plus needs, roads and shelters.
export function pinsOf(posts: OpsPost[]): OpsPin[] {
  const pins = new Map<string, OpsPin>();
  for (const p of posts) {
    const o = p.outcome;
    if (!p.coords) continue;
    if (o.kind === "site") pins.set(o.site, { key: o.site, coords: p.coords, kind: "site", tier: 0, actNow: true, support: 1, closed: false, label: `${NAMED(o.site) ? o.site : "Site"}, ${o.people} trapped, ${p.district}` });
    else if (o.kind === "copy" && pins.has(o.site) && o.counted) pins.get(o.site)!.support += 1;
    else if (o.kind === "rescued" && pins.has(o.site)) Object.assign(pins.get(o.site)!, { closed: true, actNow: false, tier: 2, label: `${NAMED(o.site) ? o.site : "Site"}, rescued` });
    else if (o.kind === "need") pins.set(p.id, { key: p.id, coords: p.coords, kind: "need", tier: o.lifeThreatening ? 0 : 1, actNow: o.lifeThreatening, support: 1, closed: false, label: `Need, ${QTY(o)}, ${p.district}` });
    else if (o.kind === "road") pins.set(`road:${o.road}`, { key: `road:${o.road}`, coords: p.coords, kind: "road", tier: 1, actNow: false, support: 1, closed: o.state === "open", label: `Road ${o.state}, ${o.road}` });
    else if (o.kind === "shelter") pins.set(`shelter:${o.name}`, { key: `shelter:${o.name}`, coords: p.coords, kind: "shelter", tier: o.used >= o.total * 0.9 ? 1 : 2, actNow: false, support: 1, closed: false, label: `${o.name}, ${o.used} of ${o.total} beds` });
  }
  return [...pins.values()];
}

// Synthetic exercise posts for /ops. Modeled on what volunteers and researchers saw in Feb 2023
// (Related systems, 09 Turkiye 2023 lessons and 10 Papers and algorithms):
//   the first hours are trapped people and copies of the same call, then needs (cold, water,
//   insulin, diesel for base-station generators), shelters filling up, closed roads, "rescued,
//   stop sharing", reposts of closed addresses, posts with no place, and criticism.
//   The second main shock (M7.5 Elbistan, 13:24 local) brings a new wave of collapse reports.
// Every person, building, phone and handle is invented. Locations are approximate exercise pins in Antakya. Phones are masked the way encode.ts masks them.
// Deterministic: the same posts every run (seeded random).
import seed from "@/data/seed.json";
import { pilot, pilotCenter } from "@/lib/pilot";
import type { LatLng } from "@/lib/types";

export const QUAKE_AT = "2023-02-06T01:17:34Z";   // USGS us6000jllz, M7.8 Pazarcık
export const SECOND_QUAKE_MIN = 547;               // USGS us6000jlqa, M7.5 Elbistan, 10:24 UTC
export const LOCAL_OFFSET_MIN = 180;               // Türkiye, UTC+3

export type NeedItem =
  | "blankets" | "water" | "tents" | "heaters" | "baby formula" | "insulin" | "diesel" | "hot meals";

export type Outcome =
  | { kind: "site"; site: string; people: number }
  | { kind: "copy"; site: string; counted: boolean }
  | { kind: "need"; item: NeedItem; quantity: number; unit: string; lifeThreatening: boolean }
  | { kind: "shelter"; name: string; used: number; total: number }
  | { kind: "road"; road: string; state: "closed" | "unconfirmed" | "open" }
  | { kind: "rescued"; site: string; people: number }
  | { kind: "hazard"; site: string; hazard: string }
  | { kind: "unclear"; why: string }
  | { kind: "held"; why: string; site?: string }
  | { kind: "none"; why: string }
  | { kind: "pending" };

export interface OpsPost {
  id: string;
  at: string;               // ISO time it was posted (scenario time)
  author: string;           // masked handle, or the agent that filed it on the live desk
  accountAgeDays?: number;
  text: string;             // as posted, phones masked
  textEn: string;           // the X agent's translation
  district: string;
  coords?: LatLng;
  outcome: Outcome;
}

export interface District { name: string; at: LatLng; weight: number; spread: number }

// Approximate exercise locations. Weights and offsets control the replay, not population estimates.
const DISTRICTS: District[] = [
  { name: "Antakya Merkez", at: pilotCenter, weight: 30, spread: 0.003 },
  { name: "Saray", at: [36.196, 36.165], weight: 18, spread: 0.002 },
  { name: "Haraparası", at: [36.211, 36.167], weight: 16, spread: 0.003 },
  { name: "Kışlasaray", at: [36.191, 36.161], weight: 14, spread: 0.002 },
  { name: "Cebrail", at: [36.202, 36.153], weight: 12, spread: 0.002 },
  { name: "Akevler", at: [36.207, 36.142], weight: 10, spread: 0.003 },
];

const BUILDINGS = [
  "Kayısı Apartmanı", "Turuncu Avlu", "Mor Avlu", "Çınar Sitesi", "Ihlamur Blok", "Selvi Apartmanı",
  "Fırat Konutları", "Lale Apartmanı", "Sedir Blok", "Nar Sitesi", "Ceviz Apartmanı", "Zeytin Blok",
  "Yeni Avlu", "Papatya Apartmanı", "Meşe Konakları", "Badem Sitesi", "Gül Apartmanı", "Kardelen Blok",
];
const PLACES: [string, string][] = [
  ["okul arkası", "behind the school"], ["cami yanı", "next to the mosque"],
  ["PTT karşısı", "across from the post office"], ["pazar yeri yanı", "next to the market"],
  ["eski hastane yolu", "on the old hospital road"], ["park karşısı", "across from the park"],
  ["fırının üstü", "above the bakery"], ["köprü başı", "at the bridge"],
];
const SHELTERS = seed.shelters.map((s) => ({
  name: s.name, total: s.bedsTotal, coords: [s.coords[0], s.coords[1]] as LatLng,
}));
const ROADS: { road: string; at: LatLng }[] = [
  { road: "İnönü Ave, north", at: [36.226, 36.159] },
  { road: "Ring road exit 3", at: [36.202, 36.185] },
];

// Posts per hour after 04:17 local, hours 0 to 11. Hour 9 holds the second main shock.
const HOURLY = [16, 22, 19, 15, 12, 11, 9, 9, 8, 26, 15, 12];

type Kind = "site" | "copy" | "need" | "shelter" | "road" | "rescued" | "hazard" | "unclear" | "held" | "none";
const MIX: Record<"early" | "rising" | "steady" | "second", Partial<Record<Kind, number>>> = {
  early: { site: 42, copy: 28, unclear: 10, none: 12, hazard: 4, need: 4 },
  rising: { site: 24, copy: 24, need: 20, unclear: 7, held: 5, none: 10, road: 5, rescued: 5, shelter: 4 },
  steady: { site: 12, copy: 14, need: 24, shelter: 16, road: 8, rescued: 20, none: 10, held: 6 },
  second: { site: 40, copy: 24, need: 8, road: 8, none: 12, hazard: 6, unclear: 2 },
};
const phase = (h: number) => (h < 2 ? "early" : h < 6 ? "rising" : h === 9 ? "second" : "steady");

const NEEDS: { item: NeedItem; w: number; min: number; max: number; step: number; unit: string; life: boolean;
  tr: (q: number, d: string, p: string) => string; en: (q: number, d: string, p: string) => string }[] = [
  { item: "blankets", w: 30, min: 20, max: 120, step: 10, unit: "", life: false,
    tr: (q, d, p) => `${d}, ${p} toplanma alanında ${q} battaniye lazım. Çok soğuk, çocuklar var.`,
    en: (q, d, p) => `${q} blankets needed at the gathering area ${p}, ${d}. Very cold, children here.` },
  { item: "water", w: 15, min: 10, max: 60, step: 5, unit: "cases", life: false,
    tr: (q, d, p) => `${d} ${p}: ${q} koli su gerekiyor, şebeke suyu yok.`,
    en: (q, d, p) => `${d}, ${p}: ${q} cases of water needed, no tap water.` },
  { item: "tents", w: 15, min: 5, max: 30, step: 5, unit: "", life: false,
    tr: (q, d, p) => `${d} ${p} aileler dışarıda kaldı, ${q} çadır lazım.`,
    en: (q, d, p) => `Families are outside ${p}, ${d}. ${q} tents needed.` },
  { item: "heaters", w: 10, min: 2, max: 10, step: 1, unit: "", life: false,
    tr: (q, d, p) => `${d} ${p} çadırlar için ${q} soba lazım, gece eksi on derece olacak.`,
    en: (q, d, p) => `${q} heaters needed for the tents ${p}, ${d}. Minus ten tonight.` },
  { item: "baby formula", w: 8, min: 5, max: 30, step: 5, unit: "boxes", life: false,
    tr: (q, d, p) => `${d} ${p} bebek maması lazım, ${q} kutu.`,
    en: (q, d, p) => `Baby formula needed ${p}, ${d}, ${q} boxes.` },
  { item: "insulin", w: 5, min: 1, max: 5, step: 1, unit: "people", life: true,
    tr: (q, d, p) => `${d} ${p} ${q} şeker hastası var, insülin bitti, acil.`,
    en: (q, d, p) => `${q} people with diabetes ${p}, ${d}, out of insulin, urgent.` },
  { item: "diesel", w: 7, min: 200, max: 600, step: 50, unit: "liters", life: false,
    tr: (q, d) => `${d} baz istasyonu jeneratörü için ${q} litre mazot lazım, yoksa şebeke gidecek.`,
    en: (q, d) => `${q} liters of diesel needed for the base station generator in ${d}, or the network goes down.` },
  { item: "hot meals", w: 10, min: 50, max: 200, step: 25, unit: "", life: false,
    tr: (q, d, p) => `${d} ${p} ${q} kişilik sıcak yemek lazım.`,
    en: (q, d, p) => `Hot meals for ${q} people needed ${p}, ${d}.` },
];

const ppl = (n: number) => (n === 1 ? "1 person" : `${n} people`);

const SITE_TEXT: { tr: (b: string, p: string, d: string, n: number, ph: string) => string; en: (b: string, p: string, d: string, n: number, ph: string) => string }[] = [
  { tr: (b, p, d, n, ph) => `${d}, ${b} (${p}) enkaz altında ${n} kişi var, sesleri geliyor. Lütfen ekip yönlendirin. İrtibat ${ph}`,
    en: (b, p, d, n, ph) => `${d}, ${b} (${p}): ${ppl(n)} under the rubble, voices heard. Please send a team. Contact ${ph}` },
  { tr: (b, p, d, n) => `ACİL. ${b}, ${p}, ${d}. Annem ve babam enkaz altında, toplam ${n} kişi. Vinç lazım.`,
    en: (b, p, d, n) => `URGENT. ${b}, ${p}, ${d}. My mother and father are under the rubble, ${ppl(n)} in total. A crane is needed.` },
  { tr: (b, p, d, n) => `${d} ${p} ${b} yıkıldı, ${n} kişiden haber alamıyoruz. #deprem #Antakya`,
    en: (b, p, d, n) => `${b} ${p}, ${d} collapsed. No news from ${ppl(n)}.` },
  { tr: (b, p, d, n, ph) => `Kardeşim ${b} enkazında, telefonla ulaştık, sesi geliyor. Yer: ${p}, ${d}. Toplam ${n} kişi. ${ph}`,
    en: (b, p, d, n, ph) => `My brother is in the rubble of ${b}, we reached him by phone, he answers. Location: ${p}, ${d}. ${ppl(n)} in total. ${ph}` },
  { tr: (b, p, d, n) => `${b} (${p}, ${d}) enkazında çocuk sesi var, ${n} kişi, iş makinesi yok.`,
    en: (b, p, d, n) => `A child's voice in the rubble of ${b} (${p}, ${d}), ${ppl(n)}, no heavy machinery.` },
];

const UNCLEAR: [string, string][] = [
  ["Antakya'da enkaz altında kuzenim var lütfen yardım edin", "My cousin is under the rubble in Antakya, please help"],
  ["Annemden haber alamıyorum, Antakya merkezdeydi, ne yapmalıyım?", "I can't reach my mother, she was in central Antakya. What should I do?"],
  ["Bizim sokakta çok kişi enkaz altında, yardım edin", "Many people under the rubble on our street, help"],
];
const NONE: [string, string, string][] = [
  ["Saatlerdir kimse gelmedi, ekipler nerede?", "Nobody has come for hours. Where are the teams?", "criticism, not a request"],
  ["Allah yardımcımız olsun, Antakya çok kötü durumda.", "God help us, Antakya is in a very bad state.", "not a request"],
  ["Deprem 7.8 imiş, merkez Pazarcık.", "The quake was 7.8, centered in Pazarcık.", "news, not a request"],
  ["Herkes iyi mi? Ailemden haber bekliyorum.", "Is everyone OK? Waiting for news from my family.", "not a request"],
  ["Bağış için resmi hesapları kullanın, sahte linklere dikkat.", "Use official accounts for donations, beware of fake links.", "advice, not a request"],
];
const HAZARDS: [string, string, string][] = [
  ["yanında gaz kokusu var, ekipler dikkat etsin", "gas smell next to the rubble, teams be careful", "gas smell"],
  ["yanındaki duvar hâlâ çöküyor, yaklaşmayın", "the wall next to it is still falling, keep back", "a wall still falling"],
];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SiteState { label: string; district: District; coords: LatLng; building: string; place: [string, string];
  people: number; open: boolean; text: string; textEn: string; author: string; closedAtMin?: number }

export function makeOpsPosts(seed = 2023): OpsPost[] {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const weighted = <T,>(xs: T[], w: (x: T) => number) => {
    const total = xs.reduce((s, x) => s + w(x), 0);
    let roll = r() * total;
    for (const x of xs) { roll -= w(x); if (roll <= 0) return x; }
    return xs[xs.length - 1];
  };
  const int = (min: number, max: number, step = 1) => min + step * Math.floor(r() * ((max - min) / step + 1));
  const phone = () => `•••• •• ${String(int(10, 99))}`;
  const handle = () => `@${"abcdefghijklmnoprstuvyz"[int(0, 22)]}***${int(10, 99)}`;
  const jitter = (d: District): LatLng => [d.at[0] + (r() - 0.5) * 2 * d.spread, d.at[1] + (r() - 0.5) * 2 * d.spread];
  const atMin = (m: number) => new Date(Date.parse(QUAKE_AT) + m * 60_000 + int(0, 59) * 1000).toISOString();
  const hhmm = (m: number) => {
    const t = Math.round(Date.parse(QUAKE_AT) / 60_000) + m + LOCAL_OFFSET_MIN;
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

  const sites: SiteState[] = [];
  const shelterUsed = new Map(SHELTERS.map((s) => [s.name, Math.round(s.total * 0.2)]));
  const posts: OpsPost[] = [];
  let siteNo = 101;

  const newSite = (m: number): OpsPost => {
    const d = weighted(DISTRICTS, (x) => x.weight);
    const building = pick(BUILDINGS), place = pick(PLACES), t = pick(SITE_TEXT), ph = phone(), author = handle();
    let people = weighted([1, 2, 3, 4, 5, 6], (n) => [6, 6, 4, 2, 1, 1][n - 1]);
    if (t === SITE_TEXT[1]) people = Math.max(2, people);   // "my mother and father"

    const s: SiteState = { label: `Site ${siteNo++}`, district: d, coords: jitter(d), building, place, people, open: true,
      text: t.tr(building, place[0], d.name, people, ph), textEn: t.en(building, place[1], d.name, people, ph), author };
    sites.push(s);
    return { id: "", at: atMin(m), author, accountAgeDays: int(200, 4000), text: s.text, textEn: s.textEn,
      district: d.name, coords: s.coords, outcome: { kind: "site", site: s.label, people } };
  };

  HOURLY.forEach((count, h) => {
    const lo = h === 9 ? SECOND_QUAKE_MIN + 1 : h * 60 + (h === 0 ? 3 : 0);
    const minutes = Array.from({ length: count }, () => int(lo, h * 60 + 59)).sort((a, b) => a - b);
    const mix = MIX[phase(h)];
    for (const m of minutes) {
      const kind = weighted(Object.keys(mix) as Kind[], (k) => mix[k] ?? 0);
      const open = sites.filter((s) => s.open);
      const closed = sites.filter((s) => !s.open);
      let post: OpsPost;
      if (kind === "copy" && open.length) {
        const s = pick(open.slice(-8));
        const counted = r() > 0.1;
        post = { id: "", at: atMin(m), author: counted ? handle() : s.author, accountAgeDays: int(30, 4000),
          text: `Lütfen paylaşın: ${s.text}`, textEn: `Please share: ${s.textEn}`, district: s.district.name,
          coords: s.coords, outcome: { kind: "copy", site: s.label, counted } };
      } else if (kind === "rescued" && open.length) {
        const s = pick(open.slice(0, Math.max(1, open.length - 3)));
        s.open = false; s.closedAtMin = m;
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(200, 4000),
          text: `${s.building}, ${s.district.name}: ${s.people} kişi enkazdan canlı çıkarıldı. Artık paylaşmayın, teşekkürler.`,
          textEn: `${s.building}, ${s.district.name}: ${s.people} people pulled out alive. Please stop sharing, thank you.`,
          district: s.district.name, coords: s.coords, outcome: { kind: "rescued", site: s.label, people: s.people } };
      } else if (kind === "hazard" && open.length) {
        const s = pick(open.slice(-6)), [tr, en, hz] = pick(HAZARDS);
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(200, 4000),
          text: `${s.building} (${s.district.name}) enkazının ${tr}.`, textEn: `${s.building} (${s.district.name}): ${en}.`,
          district: s.district.name, coords: s.coords, outcome: { kind: "hazard", site: s.label, hazard: hz } };
      } else if (kind === "held" && closed.length && r() < 0.6) {
        const s = pick(closed);
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(30, 4000), text: s.text, textEn: s.textEn,
          district: s.district.name, coords: s.coords,
          outcome: { kind: "held", site: s.label, why: `${s.label} was closed as rescued at ${hhmm(s.closedAtMin ?? m)}, a volunteer checks before anyone goes` } };
      } else if (kind === "held") {
        const d = weighted(DISTRICTS, (x) => x.weight), b = pick(BUILDINGS), p = pick(PLACES), t = pick(SITE_TEXT), n = int(3, 9), ph = phone();
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: 0,
          text: t.tr(b, p[0], d.name, n, ph), textEn: t.en(b, p[1], d.name, n, ph), district: d.name, coords: jitter(d),
          outcome: { kind: "held", why: "posted by an account opened today, a volunteer calls before a team is sent" } };
      } else if (kind === "need") {
        const d = weighted(DISTRICTS, (x) => x.weight), n = weighted(NEEDS, (x) => x.w), p = pick(PLACES), q = int(n.min, n.max, n.step);
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(200, 4000), text: n.tr(q, d.name, p[0]),
          textEn: n.en(q, d.name, p[1]), district: d.name, coords: jitter(d),
          outcome: { kind: "need", item: n.item, quantity: q, unit: n.unit, lifeThreatening: n.life } };
      } else if (kind === "shelter") {
        const s = pick(SHELTERS);
        const used = Math.min(s.total, (shelterUsed.get(s.name) ?? 0) + int(4, 14));
        shelterUsed.set(s.name, used);
        const full = used >= s.total * 0.95;
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(200, 4000),
          text: full ? `${s.name} doldu, ${used}/${s.total}. Yeni gelenleri başka barınağa yönlendirin.` : `${s.name} şu an ${used}/${s.total} dolu, ${s.total - used} yer var.`,
          textEn: full ? `${s.name} is full, ${used} of ${s.total}. Send new arrivals to another shelter.` : `${s.name} is at ${used} of ${s.total}, ${s.total - used} beds free.`,
          district: pilot.name, coords: s.coords, outcome: { kind: "shelter", name: s.name, used, total: s.total } };
      } else if (kind === "road") {
        const rd = pick(ROADS), roll = r();
        const [tr, en, state] = roll < 0.4
          ? [`${rd.road} kapalı, köprüde çatlak var. Araçlar geçmesin.`, `${rd.road} is closed, a crack in the bridge. No vehicles.`, "closed" as const]
          : roll < 0.75
            ? [`${rd.road} enkaz yüzünden kapandı, ambulans geçemiyor.`, `${rd.road} is blocked by debris, ambulances cannot pass.`, "closed" as const]
            : [`${rd.road} kapalıymış duydum, teyit eden var mı?`, `I heard ${rd.road} is closed. Can anyone confirm?`, "unconfirmed" as const];
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(200, 4000), text: tr, textEn: en,
          district: pilot.name, coords: rd.at, outcome: { kind: "road", road: rd.road, state } };
      } else if (kind === "unclear") {
        const [tr, en] = pick(UNCLEAR);
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(100, 4000), text: tr, textEn: en,
          district: pilot.name, outcome: { kind: "unclear", why: "no place given, a volunteer asks where and who" } };
      } else if (kind === "none") {
        const [tr, en, why] = pick(NONE);
        post = { id: "", at: atMin(m), author: handle(), accountAgeDays: int(100, 4000), text: tr, textEn: en,
          district: pilot.name, outcome: { kind: "none", why } };
      } else {
        post = newSite(m);
      }
      post.id = `ops-${String(posts.length + 1).padStart(3, "0")}`;
      posts.push(post);
    }
  });
  return posts;
}

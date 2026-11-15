import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export interface FamilyUpdate {
  _id: string; deskId: string; siteId: string; alias: string; summary: string;
  sourceAt: string; publishedAt: string; expiresAt: string; publishedBy: string;
  revoked: boolean; demo: boolean;
}
const g = globalThis as typeof globalThis & { familyVoiceDemo?: Map<string, FamilyUpdate>; familyVoiceHits?: Map<string, number[]> };
const demo = g.familyVoiceDemo ??= new Map<string, FamilyUpdate>();
const hits = g.familyVoiceHits ??= new Map<string, number[]>();

export function limitVoice(key: string, count = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  if (!hits.has(key) && hits.size >= 5000) {
    for (const [k,v] of hits) if (v.at(-1)! < now-3600_000) hits.delete(k);
    if (hits.size >= 5000) return true;
  }
  const current = (hits.get(key) ?? []).filter(t => t > now-windowMs);
  if (current.length >= count) return true;
  current.push(now); hits.set(key, current);
  if (hits.size > 5000) for (const [k,v] of hits) if (v.at(-1)! < now-windowMs) hits.delete(k);
  return false;
}
export function voiceSecret(): string {
  const value = process.env.FAMILY_VOICE_SECRET;
  if (!value || value.length < 32) throw new Error("FAMILY_VOICE_SECRET must contain at least 32 characters");
  return value;
}
export function same(a: string, b: string): boolean {
  const h = (v: string) => createHmac("sha256", "family-voice-compare").update(v).digest();
  return timingSafeEqual(h(a),h(b));
}
export function makeUpdate(input: Omit<FamilyUpdate, "_id"|"revoked"|"publishedAt">): { update: FamilyUpdate } {
  return { update: { ...input, _id: randomBytes(8).toString("hex"), publishedAt: new Date().toISOString(), revoked: false } };
}
async function collection() { return (await getDb()).collection<FamilyUpdate>("family_voice"); }
function demoStorage() { return !process.env.MONGODB_URI && process.env.DEMO_MODE === "1"; }
export async function saveUpdate(update: FamilyUpdate) {
  if (demoStorage()) {
    for (const [key, value] of demo) if (Date.parse(value.expiresAt) <= Date.now()) demo.delete(key);
    if (demo.size >= 100) throw new Error("Demo update capacity reached");
    demo.set(update._id,update);
  }
  else await (await collection()).insertOne(update);
}
export async function getUpdate(reference: string): Promise<FamilyUpdate|null> {
  return demoStorage() ? demo.get(reference) ?? null : (await collection()).findOne({_id:reference});
}
export async function listUpdates(deskId: string) {
  const all = demoStorage() ? [...demo.values()].filter(d=>d.deskId===deskId).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)) : await (await collection()).find({deskId}).sort({publishedAt:-1}).limit(100).toArray();
  // Explicit projection also excludes legacy PIN fields on previously stored documents.
  return all.map(doc=>({_id:doc._id,deskId:doc.deskId,siteId:doc.siteId,publishedBy:doc.publishedBy,revoked:doc.revoked,...publicUpdate(doc)}));
}
export async function listPublicUpdates() {
  const now = new Date().toISOString();
  const all = demoStorage()
    ? [...demo.values()].filter(d=>!d.revoked && d.expiresAt>now).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,100)
    : await (await collection()).find({revoked:false,expiresAt:{$gt:now}}).sort({publishedAt:-1}).limit(100).toArray();
  return all.map(doc=>({id:doc._id,...publicUpdate(doc)}));
}
export async function revokeUpdate(reference: string, deskId: string) {
  if (demoStorage()) { const doc=demo.get(reference); if(doc?.deskId===deskId) doc.revoked=true; }
  else await (await collection()).updateOne({_id:reference,deskId},{$set:{revoked:true}});
}
export function issueTicket(reference: string): string {
  const data=Buffer.from(JSON.stringify({reference,exp:Date.now()+10*60_000,nonce:randomBytes(8).toString("hex")})).toString("base64url");
  return data+"."+createHmac("sha256",voiceSecret()).update(data).digest("base64url");
}
export function readTicket(ticket: string): string|null {
  try {
    const [data,signature,extra]=ticket.split(".");
    if(extra || !signature || !same(signature,createHmac("sha256",voiceSecret()).update(data).digest("base64url"))) return null;
    const value=JSON.parse(Buffer.from(data,"base64url").toString());
    return typeof value.reference==="string" && value.exp>Date.now() ? value.reference : null;
  } catch { return null; }
}
export function publicUpdate(doc: FamilyUpdate) {
  return {alias:doc.alias,summary:doc.summary,sourceAt:doc.sourceAt,publishedAt:doc.publishedAt,expiresAt:doc.expiresAt,demo:doc.demo};
}

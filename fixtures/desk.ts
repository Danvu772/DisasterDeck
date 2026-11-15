// Fake people, their context files, and the desk's event stream.
// Swap for the real API once Role 1 ships a feed endpoint. Every name and number is made up.
import type { Event, Message, User } from "@/lib/types";

const DESK = "malatya-2023";

export const users: User[] = [
  {
    _id: "volunteer-callback", name: "Zeynep", role: "volunteer", region: "malatya-merkez", status: "available",
    deskId: DESK, trust: "vetted",
    profile: { skills: ["turkish", "phone_calls"], vehicle: "none", notes: "Night shift until 04:00. Prefers short tasks." },
  },
  {
    _id: "field-alpha", name: "Saha Ekibi A", role: "field", region: "malatya-merkez", status: "busy",
    deskId: DESK, trust: "official", coords: [38.351, 38.31],
    profile: { skills: ["rescue", "first_aid"], vehicle: "truck", notes: "Mostly talks by voice. Keep replies to one line." },
  },
  {
    _id: "supplier-primary", name: "Demo Depo A", role: "supplier", region: "malatya-merkez", status: "busy",
    deskId: DESK, trust: "vetted",
    profile: { vehicle: "van", stock: { blankets: 180, water: 400 }, notes: "One van, one driver." },
  },
  {
    _id: "coordinator-duty", name: "Demo NÃ¶betÃ§i KoordinatÃ¶r", role: "coordinator", region: "malatya-merkez", status: "available",
    deskId: DESK, trust: "official",
    profile: { notes: "Approves field team dispatch. Wants incidents first." },
  },
];

type FeedEvent = Event & { _id: string };

export function makeEvents(now: number): FeedEvent[] {
  const ago = (min: number) => new Date(now - min * 60000);
  const e = (min: number, rest: Omit<FeedEvent, "ts" | "deskId" | "lane">): FeedEvent => ({
    ts: ago(min), deskId: DESK,
    lane: rest.source === "person" || rest.source === "system" ? 0 : 1, ...rest,
  });
  return [
    e(1, { _id: "ev-30", type: "incident", source: "person", actor: "supplier-primary", status: "done",
      payload: { kind: "vehicle_breakdown", text: "Lastik patladı, 14. km'deyim", textEn: "Flat tire, stuck at km 14, 30 blankets on board", canContinue: false, taskId: "task-3" },
      result: { recordIds: ["inc-1"], reason: "Delivery blocked, relay task to supplier-backup" } }),
    e(3, { _id: "ev-29", type: "capacity", source: "instagram", actor: "ig-agent", status: "done", observedAt: ago(120),
      payload: { shelter: "Shelter A, school gym", bedsUsed: 58, bedsTotal: 60 },
      result: { recordIds: ["sh-a"], reason: "Shelter A now 58/60 (photo taken 2 h ago)" } }),
    e(4, { _id: "ev-28", type: "approval", source: "person", actor: "coordinator-duty", status: "done",
      payload: { taskId: "task-5", approved: true }, result: { recordIds: ["task-5"], reason: "Saha Ekibi A dispatched to Çınar St. 3" } }),
    e(6, { _id: "ev-27", type: "need", source: "person", actor: "field-alpha", status: "done",
      payload: { item: "blankets", quantity: 20, lifeThreatening: true, siteId: "site-52" },
      result: { recordIds: ["need-1"], reason: "Need open at tier 0, delivery task to supplier-primary" } }),
    e(7, { _id: "ev-26", type: "alert", source: "nasa", actor: "satellite-watcher", status: "done",
      payload: { zoneId: "kale", kind: "silent_zone", evidence: { damage: 0.8, dark: true, calls: 1 } },
      result: { recordIds: ["zone-kale"], reason: "Kale flagged silent. Sites there +30 priority" } }),
    e(9, { _id: "ev-25", type: "answer", source: "person", actor: "volunteer-callback", status: "done",
      payload: { taskId: "task-0", result: "done", note: "called, voices heard" },
      result: { recordIds: ["site-52"], reason: "Site verified, confidence confirmed" } }),
    e(12, { _id: "ev-24", type: "report", source: "x", actor: "x-agent", status: "merged",
      payload: { kind: "trapped", text: "Annem enkaz altında, Örnek Sk. 12 lütfen yardım", textEn: "My mother is under the rubble, Örnek St. 12, please help", address: "Örnek St. 12", peopleCount: 1, phoneMasked: "42" },
      result: { recordIds: ["site-57"], reason: "Merged into site 57 (4 sources)" } }),
    e(14, { _id: "ev-23", type: "report", source: "x", actor: "x-agent", status: "done",
      payload: { kind: "trapped", text: "Örnek Sokak 12 de enkaz altında ses var", textEn: "Voices under the rubble at Örnek Street 12", address: "Örnek St. 12" },
      result: { recordIds: ["site-57"], reason: "Opened site 57" } }),
    e(0, { _id: "ev-31", type: "report", source: "x", actor: "x-agent", status: "pending",
      payload: { kind: "trapped", text: "Kale'de bina çöktü, 3 kişi", textEn: "Building collapsed in Kale, 3 people" } }),
  ].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
}

export function makeMessages(userId: string, now: number): Message[] {
  const ago = (min: number) => new Date(now - min * 60000);
  if (userId !== "volunteer-callback") return [];
  return [
    { _id: "m1", userId, from: "agent", ts: ago(10), text: "Please call this number about Çınar St. 3. One person posted, nobody has called yet." },
    { _id: "m2", userId, from: "user", ts: ago(9), text: "called, voices heard" },
    { _id: "m3", userId, from: "agent", ts: ago(9), text: "Marked Çınar St. 3 as verified. Asking Demo NÃ¶betÃ§i KoordinatÃ¶r to send a team.", eventIds: ["ev-25"] },
  ];
}

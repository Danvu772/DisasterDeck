import {
  Baby, BatteryCharging, BedDouble, Droplets, Flame, Fuel, Package, Pill, Tent, Utensils, type LucideIcon,
} from "lucide-react";
import type { Need } from "@/lib/types";
import { PinnedList, type PinnedItem } from "./motion/PinnedList";
import { statusWord } from "./detail/fields";
import { ageText } from "./encode";

// Need.requestedBy is in the contract (lib/types.ts v2.1), so a need is its own type here.
export type MyNeed = Need;

// What the item is, as an icon. Anything unknown is a box.
const ICONS: [RegExp, LucideIcon][] = [
  [/water|drink/i, Droplets],
  [/insulin|medic|pill|drug/i, Pill],
  [/baby|formula/i, Baby],
  [/fuel|diesel|petrol|gas/i, Fuel],
  [/meal|food|bread/i, Utensils],
  [/tent/i, Tent],
  [/heater/i, Flame],
  [/power|battery|charger/i, BatteryCharging],
  [/blanket|bed|sleeping/i, BedDouble],
];
const iconFor = (item: string) => ICONS.find(([re]) => re.test(item))?.[1] ?? Package;

function tone(n: MyNeed): PinnedItem["tone"] {
  if (n.tier === 0 || (n.lifeThreatening && n.status !== "delivered")) return "act";
  return n.tier === 1 ? "urgent" : "calm";
}

function note(n: MyNeed, now: number): string {
  const word = statusWord(n.status);
  if (n.status === "proposed") return `${word} · ${n.support} of 3 requests`;
  const last = n.history.at(-1);
  return last ? `${word} · ${last.reason}, ${ageText(last.ts, now)}` : word;
}

// The needs this person filed, most urgent first and pinned on top. The list restarts when
// the board changes a need, so what it shows is never older than the last poll.
export function YourNeeds({ needs, now }: { needs: MyNeed[]; now: number }) {
  const items: PinnedItem[] = needs.map((n, i) => ({
    id: n._id,
    title: `${n.quantity} ${n.item}`,
    note: note(n, now),
    icon: iconFor(n.item),
    tone: tone(n),
    pinned: i === 0,
  }));
  // The minute is in the key too, so "5 min ago" moves on.
  const key = `${Math.floor(now / 60000)}|${needs.map((n) => `${n._id}:${n.status}:${n.history.length}`).join("|")}`;
  return <PinnedList key={key} items={items} title="All requests" empty="No requests yet. Ask your agent." />;
}

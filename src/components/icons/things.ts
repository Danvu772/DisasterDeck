// Which Koboyo icon stands for which thing on the desk. One place, so the map markers, the map list,
// the legend and the record cards always agree.
import type { IncidentKind } from "@/lib/types";
import {
  KAlert, KCollapse, KCone, KDanger, KElectric, KFire, KFirstAid, KGas, KPackage, KPhone, KRoadblock, KTent, KTruck, KWater,
  type KIcon,
} from "./koboyo";

// A site's hazard is free text from a report ("gas smell at the site", "fire"). The first match wins.
// Each pattern starts at a word start, so place names and longer words do not count
// ("Gaziantep" is not gas, "firefighters" is not fire, "powerful" is not live wires).
export type HazardKind = "fire" | "gas" | "electric" | "collapse" | "water" | "other";
const HAZARDS: { kind: HazardKind; word: string; test: RegExp; icon: KIcon }[] = [
  { kind: "fire", word: "Fire", test: /(?<!\p{L})(?:fire(?!fight)|smoke|burn|blaze|flame|yang[ıi]n|duman)/iu, icon: KFire },
  { kind: "gas", word: "Gas", test: /(?<!\p{L})(?:gas(?!\p{L})|gaz(?!iantep))/iu, icon: KGas },
  { kind: "electric", word: "Live wires", test: /(?<!\p{L})(?:electr|elektr|wire|power(?!ful)|cable|kablo)/iu, icon: KElectric },
  { kind: "collapse", word: "Could collapse", test: /(?<!\p{L})(?:collaps|wall|fall|unstable|crack|aftershock|çök|duvar)/iu, icon: KCollapse },
  { kind: "water", word: "Water", test: /(?<!\p{L})(?:water|flood|pipe|su bask|sel(?!\p{L}))/iu, icon: KWater },
];
const OTHER = { kind: "other" as const, word: "Danger", icon: KDanger };

// The map legend, from the same list the markers use.
export const HAZARD_LEGEND: { word: string; icon: KIcon }[] = [
  ...HAZARDS.map(({ word, icon }) => ({ word, icon })), { word: "Other danger", icon: KDanger },
];

export function hazardType(text?: string | null): { kind: HazardKind; word: string; icon: KIcon } | null {
  if (!text) return null;
  return HAZARDS.find((h) => h.test.test(text)) ?? OTHER;
}

// A problem a team reported from the field.
export const INCIDENT_ICON: Record<IncidentKind, KIcon> = {
  injury: KFirstAid,
  vehicle_breakdown: KTruck,
  road_blocked: KRoadblock,
  short_supply: KPackage,
  unreachable: KPhone,
  unsafe: KDanger,
  cannot_find: KAlert,
  handover: KAlert,
  other: KAlert,
};

// The icon for one record, the same one its map marker shows. null = use the kind's default
// (KIND_ICON in detail/fields.ts), e.g. a site with no danger.
export function thingIcon(kind: string, record?: unknown): KIcon | null {
  const r = (record ?? {}) as { hazard?: string | null; kind?: IncidentKind; state?: string };
  if (kind === "site") return hazardType(r.hazard)?.icon ?? null;
  if (kind === "incident") return (r.kind && INCIDENT_ICON[r.kind]) || KDanger;
  if (kind === "road") return r.state === "closed" ? KRoadblock : KCone;
  if (kind === "shelter") return KTent;
  return null;
}

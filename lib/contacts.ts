// The per-desk help directory (D-0009). Static data in data/contacts.json, one key per desk.
// When an open incident is a vehicle_breakdown or short_supply, the matching contacts are
// shown on the incident card and handed to the person's agent. Read only: it never writes.
//
// Categories: tow, tire, fuel, pharmacy. Numbers are dialed by the person on the ground,
// so they are shown plain (unlike event text, which is masked). This file is demo data;
// a county signs on and the desk gets its real directory per desk in the pilot.

import directory from "../data/contacts.json";
import type { IncidentKind } from "./types";

export const CONTACT_CATEGORIES = ["tow", "tire", "fuel", "pharmacy"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export interface Contact {
  id: string;
  name: string;
  category: ContactCategory;
  phone: string;
  region?: string;
  notes?: string;
}

const DIRECTORY = directory as Record<string, Contact[]>;

/** The desk's whole directory, or an empty list when the desk has none. */
export function contactsFor(deskId: string): Contact[] {
  return DIRECTORY[deskId] ?? [];
}

export const categoryWord: Record<ContactCategory, string> = {
  tow: "Tow", tire: "Tire", fuel: "Fuel", pharmacy: "Pharmacy",
};

// short_supply is matched by what is short, from the incident text. A vehicle breakdown always
// wants a tow, a spare and a full tank: the text alone does not say which of the three.
const SHORT_SUPPLY_KEYWORDS: Record<Exclude<ContactCategory, "tow">, RegExp> = {
  tire: /\btire|tyre|lastik|wheel|puncture|flat\b/i,
  fuel: /\bfuel|diesel|petrol|gasoline|benzin|akaryakıt|yakıt|empty tank\b/i,
  pharmacy: /\bmedicine|medication|drug|pharmacy|eczane|insulin|doctor|medical|diapers?\b/i,
};

/** Which directory categories fit an incident. Empty for kinds the directory does not cover. */
export function categoriesForIncident(kind: IncidentKind, text: string): ContactCategory[] {
  if (kind === "vehicle_breakdown") return ["tow", "tire", "fuel"];
  if (kind === "short_supply") {
    const hit = CONTACT_CATEGORIES.filter((c) =>
      c !== "tow" && SHORT_SUPPLY_KEYWORDS[c as Exclude<ContactCategory, "tow">].test(text));
    // Nothing in the text says what is short: offer the whole directory, the agent asks which.
    return hit.length ? hit : [...CONTACT_CATEGORIES];
  }
  return [];
}

/** The contacts the desk offers for an open incident, in directory order. */
export function contactsForIncident(deskId: string, kind: IncidentKind, text: string): Contact[] {
  const categories = new Set(categoriesForIncident(kind, text));
  return contactsFor(deskId).filter((c) => categories.has(c.category));
}

/** One line the personal agent reads and quotes when it hands a contact over. */
export function contactsLine(c: Contact): string {
  return `${categoryWord[c.category]}: ${c.name} · ${c.phone}` +
    `${c.region ? ` · ${c.region}` : ""}${c.notes ? ` · ${c.notes}` : ""}`;
}

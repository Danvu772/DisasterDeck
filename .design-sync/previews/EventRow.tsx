import { EventRow } from "disaster-desk";
import { makeEvents, users } from "@/fixtures/desk";

const now = Date.now();
const events = makeEvents(now);
const nameOf = (id: string) => users.find((u) => u._id === id)?.name ?? id;
const pick = (id: string) => events.find((e) => e._id === id)!;
const list = (ids: string[]) => (
  <ul style={{ maxWidth: 440 }}>
    {ids.map((id) => { const e = pick(id); return <EventRow key={id} e={e} now={now} actorName={nameOf(e.actor)} />; })}
  </ul>
);

export const PersonAndMachine = () => list(["ev-30", "ev-26", "ev-29"]);
// A person said it (sans) with the Turkish original, and a machine said it (mono).

export const Pending = () => list(["ev-31"]);
// Still in the Brain's queue: faded, "Status: pending".

export const Merged = () => list(["ev-24", "ev-25"]);
// A tweet merged into an existing site.

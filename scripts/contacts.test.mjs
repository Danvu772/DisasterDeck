// WS-3: a supplier or field team with an open incident gets matching contacts from the desk's
// directory (D-0009). Offline: the directory is static data, and the API is exercised with the
// agent key (no database).   npm run check:contacts
import assert from "node:assert/strict";
import test from "node:test";

process.env.AGENT_KEY = "offline-contacts-test-agent-key";
process.env.AUTH_SECRET = "offline-contacts-test-auth-secret";

const { contactsFor, contactsForIncident, categoriesForIncident } = await import("../src/lib/contacts.ts");

test("a vehicle_breakdown returns tow and tire contacts for that desk", () => {
  assert.deepEqual(categoriesForIncident("vehicle_breakdown", "flat tire"), ["tow", "tire", "fuel"]);
  const c = contactsForIncident("antakya-2023", "vehicle_breakdown", "lastik patladı");
  const cats = new Set(c.map((x) => x.category));
  assert.ok(cats.has("tow"), "a breakdown offers a tow");
  assert.ok(cats.has("tire"), "a breakdown offers a tire");
  assert.ok(c.some((x) => x.phone && x.name), "each contact has a name and a number");
});

test("a short_supply matches what is short, from the incident text", () => {
  assert.deepEqual(contactsForIncident("antakya-2023", "short_supply", "we ran out of diesel")
    .map((c) => c.category), ["fuel"]);
  const meds = contactsForIncident("antakya-2023", "short_supply", "no insulin left");
  assert.ok(meds.length && meds.every((c) => c.category === "pharmacy"));
  // Nothing in the text says what is short: the whole directory is offered, and the agent asks.
  assert.equal(contactsForIncident("antakya-2023", "short_supply", "we are short").length, contactsFor("antakya-2023").length);
});

test("an incident the directory does not cover returns no contacts", () => {
  assert.equal(contactsForIncident("antakya-2023", "road_blocked", "road closed").length, 0);
});

test("GET /api/contacts returns vehicle_breakdown contacts for the desk (agent key)", async () => {
  const { GET } = await import("../src/app/api/contacts/route.ts");
  const res = await GET(new Request("http://localhost/api/contacts?desk=antakya-2023&kind=vehicle_breakdown", {
    headers: { "x-agent-key": process.env.AGENT_KEY },
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.desk, "antakya-2023");
  const cats = new Set(body.contacts.map((c) => c.category));
  assert.ok(cats.has("tow") && cats.has("tire"), `tow and tire, got ${[...cats]}`);
  assert(body.contacts.every((c) => c.phone && c.name), "name and number on every contact");
});

test("GET /api/contacts rejects an unknown caller", async () => {
  const { GET } = await import("../src/app/api/contacts/route.ts");
  const res = await GET(new Request("http://localhost/api/contacts?desk=antakya-2023"));
  assert.equal(res.status, 401);
});

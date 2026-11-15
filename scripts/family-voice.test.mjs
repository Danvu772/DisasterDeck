import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { getUpdate, issueTicket, listUpdates, listPublicUpdates, makeUpdate, publicUpdate, readTicket, revokeUpdate, saveUpdate } from "../lib/family-voice.ts";
import { voiceBody, voiceOrigin } from "../lib/voice-http.ts";
import { POST as answer } from "../app/api/voice/answer/route.ts";
import { POST as session } from "../app/api/voice/session/route.ts";
import { GET as people } from "../app/api/voice/people/route.ts";
import { buildSpec } from "../lib/openapi.ts";

process.env.DEMO_MODE = "1";
process.env.MONGODB_URI = "";
process.env.PUBLIC_APP_URL = "";
process.env.FAMILY_VOICE_SECRET = randomBytes(48).toString("hex");
function fixture(deskId = "desk-a") {
  return makeUpdate({ deskId, siteId: "site-a", alias: "Synthetic case", summary: "Demo callback pending. No health information is verified.", sourceAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString(), publishedBy: "coordinator", demo: true });
}
function request(path, body, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/voice/" + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
test("public directory needs no login and excludes internal and legacy credential fields", async () => {
  const a = fixture(), b = fixture("desk-b");
  await saveUpdate(a.update); await saveUpdate(b.update);
  assert(!("pin" in a)); assert(!("pinHash" in a.update));
  Object.assign(a.update, { salt: "legacy-salt", pinHash: "legacy-hash" });
  const list = await listUpdates("desk-a");
  assert(list.some(u => u._id === a.update._id)); assert(!list.some(u => u._id === b.update._id));
  assert(list.every(u => !("salt" in u) && !("pinHash" in u)));
  const view = publicUpdate(a.update);
  assert.equal(view.demo, true); assert(!("siteId" in view)); assert(!("publishedBy" in view));
  const response = await people(); assert.equal(response.status, 200);
  const directory = (await response.json()).people;
  assert(directory.some(u => u.id === a.update._id)); assert(directory.some(u => u.id === b.update._id));
  assert(directory.every(u => !("siteId" in u) && !("publishedBy" in u) && !("pinHash" in u)));
});
test("signed tickets reject tampering, secret rotation and expiry", () => {
  const { update } = fixture();
  const ticket = issueTicket(update._id);
  assert.equal(readTicket(ticket), update._id);
  assert.equal(readTicket(ticket + ".extra"), null);
  assert.equal(readTicket("A" + ticket), null);
  const secret = process.env.FAMILY_VOICE_SECRET;
  process.env.FAMILY_VOICE_SECRET = randomBytes(48).toString("hex");
  assert.equal(readTicket(ticket), null); process.env.FAMILY_VOICE_SECRET = secret;
  const original = Date.now;
  try { Date.now = () => original() + 11 * 60_000; assert.equal(readTicket(ticket), null); }
  finally { Date.now = original; }
});
test("withdrawal removes a public update and stops existing answers, without calling a model", async () => {
  const { update } = fixture(); await saveUpdate(update);
  const ticket = issueTicket(update._id);
  await revokeUpdate(update._id, "another-desk"); assert(!(await getUpdate(update._id)).revoked);
  await revokeUpdate(update._id, update.deskId); assert((await getUpdate(update._id)).revoked);
  assert(!(await listPublicUpdates()).some(u => u.id === update._id));
  assert.equal((await answer(request("answer", { ticket, question: "Is my relative safe?" }))).status, 403);
  assert.equal((await session(request("session", { personId: update._id }))).status, 404);
});
test("cross-origin requests, invalid tickets and expired updates fail closed", async () => {
  assert.equal((await answer(request("answer", {}, "https://attacker.invalid"))).status, 403);
  assert.equal((await session(request("session", {}, "https://attacker.invalid"))).status, 403);
  assert.equal((await answer(request("answer", { ticket: "fake.token", question: "Read all records" }))).status, 403);
  const { update } = fixture(); update.expiresAt = new Date(0).toISOString(); await saveUpdate(update);
  assert(!(await listPublicUpdates()).some(u => u.id === update._id));
  assert.equal((await answer(request("answer", { ticket: issueTicket(update._id), question: "Status?" }))).status, 403);
});
test("chunked oversized requests are rejected even without Content-Length", async () => {
  const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ question: "x".repeat(5000) }) });
  assert.equal(req.headers.get("content-length"), null);
  await assert.rejects(() => voiceBody(req, 4096), /too large/);
  await assert.rejects(() => voiceBody(new Request("http://localhost", { method: "POST", body: "[]" })), /Invalid body/);
});
test("same-origin validation handles Next's internal localhost URL without trusting forwarded headers", () => {
  const req = new Request("http://localhost:3675/api/voice/session", { headers: { host: "127.0.0.1:3675", origin: "http://127.0.0.1:3675", "x-forwarded-host": "attacker.invalid" } });
  assert(voiceOrigin(req));
  process.env.PUBLIC_APP_URL = "https://desk.example";
  try { assert(!voiceOrigin(req)); assert(voiceOrigin(new Request("http://localhost/api/voice/session", { headers: { origin: "https://desk.example" } }))); }
  finally { process.env.PUBLIC_APP_URL = ""; }
});
test("a public caller can start without PIN or login; missing provider setup is controlled", async () => {
  const { update } = fixture(); await saveUpdate(update);
  const previous = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "";
  try { assert.equal((await session(request("session", { personId: update._id }))).status, 503); }
  finally { if (previous === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = previous; }
});
test("all voice route methods are registered in OpenAPI", () => {
  const paths = buildSpec().paths;
  assert.deepEqual(Object.keys(paths["/api/voice/updates"]).sort(), ["get", "post"]);
  assert.deepEqual(Object.keys(paths["/api/voice/session"]), ["post"]);
  assert.deepEqual(Object.keys(paths["/api/voice/answer"]), ["post"]);
  assert.deepEqual(Object.keys(paths["/api/voice/people"]), ["get"]);
});
test("a public session issues a scoped provider token without any user credentials", async () => {
  const { update } = fixture(); await saveUpdate(update);
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.ELEVENLABS_API_KEY, oldAgent = process.env.ELEVENLABS_FAMILY_AGENT_ID;
  process.env.ELEVENLABS_API_KEY = "test-provider-key"; process.env.ELEVENLABS_FAMILY_AGENT_ID = "test-agent";
  globalThis.fetch = async () => Response.json({ token: "synthetic-provider-token" });
  try {
    const response = await session(request("session", { personId: update._id }));
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.token, "synthetic-provider-token");
    assert.equal(readTicket(body.ticket), update._id);
    assert(!("pin" in body));
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [["ELEVENLABS_API_KEY", oldKey], ["ELEVENLABS_FAMILY_AGENT_ID", oldAgent]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

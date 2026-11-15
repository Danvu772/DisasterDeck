// Ground truth for the deployed backend (#39): what the database holds for DESK_ID vs what the live
// site answers to a signed-in user. Run on the VM; the 10-minute session never leaves it:
//   ssh root@100.114.100.30 'cd /opt/desk && sudo -u desk -H node --env-file=.env.local deploy/vultr/live-api-check.mjs'
import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";
const BASE = process.env.CHECK_BASE || "https://disasterdeck.us";
const USER = process.env.CHECK_USER || "coordinator-duty";
const desk = process.env.DESK_ID;
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db(process.env.MONGODB_DB || "disaster_desk");
const truth = {};
for (const k of ["sites", "needs", "shelters", "roads", "incidents", "tasks", "users", "events"]) truth[k] = await db.collection(k).countDocuments({ deskId: desk });
await c.close();
const salt = BASE.startsWith("https") ? "__Secure-authjs.session-token" : "authjs.session-token";
const jwt = await encode({ token: { sub: "live-check", deskUserId: USER, email: "live-check@disasterdeck.us" }, secret: process.env.AUTH_SECRET, salt, maxAge: 600 });
const get = async (p) => { const r = await fetch(BASE + p, { headers: { cookie: `${salt}=${jwt}` }, redirect: "manual" }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body }; };
console.log(`desk ${desk}, as ${USER}, via ${BASE}`);
console.log("database:", JSON.stringify(truth));
const s = await get("/api/auth/session"); console.log("session:", s.status, s.body?.user?.id ?? "none");
const b = await get("/api/board");
const count = (v) => Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v;
console.log("board:", b.status, b.body ? JSON.stringify(Object.fromEntries(Object.entries(b.body).map(([k, v]) => [k, count(v)]))) : "");
const e = await get("/api/events?limit=50"); console.log("events:", e.status, Array.isArray(e.body) ? e.body.length : JSON.stringify(e.body).slice(0, 120));
const i = await get(`/api/inbox?user=${USER}`); console.log("inbox:", i.status, Array.isArray(i.body) ? i.body.length : JSON.stringify(i.body).slice(0, 120));
const u = await get("/api/users"); console.log("users:", u.status, Array.isArray(u.body) ? u.body.length : JSON.stringify(u.body).slice(0, 120));
const h = await get("/api/health"); console.log("health:", h.status, JSON.stringify(h.body));

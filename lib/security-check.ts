// Security check (#11): demo identity works only from this laptop, never through a tunnel or proxy.
// Run against the dev server: npm run security:check (BASE_URL, default http://127.0.0.1:3000).
// It never writes to the real desk: posts use a task id that does not exist, and the one post
// on a real task names a fake desk, so even a broken role rule would not touch malatya-2023.
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ghost = "task-security-check-does-not-exist";
const fakeDesk = "security-check-not-a-desk";
let failed = 0;

function line(ok: boolean, name: string, why = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${why ? `, ${why}` : ""}`);
  if (!ok) failed++;
}

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  try {
    const r = await fetch(base + path, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, location: r.headers.get("location") ?? "", json };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    return { status: 0, location: "", json: null, error: String(err.cause?.code ?? err.message) };
  }
}

function expect(r: Awaited<ReturnType<typeof call>>, want: number[], name: string): void {
  const err = r.json?.error ? ` (${String(r.json.error)})` : r.error ? ` (${r.error}, is the dev server up?)` : "";
  line(want.includes(r.status), name, want.includes(r.status) ? "" : `expected ${want.join(" or ")}, got ${r.status}${err}`);
}

const approve = (taskId: string, deskId?: string) => ({
  type: "approval", source: "person", payload: { taskId, approved: false },
  dedupeKey: `security-check-${taskId}`, ...(deskId ? { deskId } : {}),
});

async function main(): Promise<void> {
  // Through a proxy or tunnel: every demo shortcut is refused.
  const proxied = {
    "x-forwarded-for": "1.2.3.4",
    "x-forwarded-host": "example.trycloudflare.com",
    "x-real-ip": "1.2.3.4",
    "cf-connecting-ip": "1.2.3.4",
    forwarded: "for=1.2.3.4",
  };
  for (const [name, value] of Object.entries(proxied)) {
    expect(await call("GET", "/api/board", { [name]: value }), [401], `GET /api/board with ${name}, no session`);
  }
  expect(await call("GET", "/api/events?limit=1", { "x-forwarded-for": "1.2.3.4" }), [401], "GET /api/events with x-forwarded-for");
  expect(await call("POST", "/api/events?user=coordinator-duty", { "x-forwarded-for": "1.2.3.4" }, approve(ghost)),
    [401], "POST /api/events?user=coordinator-duty with x-forwarded-for");
  expect(await call("POST", "/api/chat?user=volunteer-callback", { "cf-connecting-ip": "1.2.3.4" }, { audioBase64: "AAAA" }),
    [401], "POST /api/chat?user=volunteer-callback with cf-connecting-ip");
  expect(await call("POST", "/api/chat", { "x-forwarded-for": "1.2.3.4" }, { userId: "volunteer-callback", audioBase64: "AAAA" }),
    [401], "POST /api/chat with body.userId and x-forwarded-for");
  {
    const r = await call("GET", "/coordinator?user=coordinator-duty", { "x-forwarded-for": "1.2.3.4" });
    const ok = r.status >= 300 && r.status < 400 && new URL(r.location, base).pathname === "/login";
    line(ok, "GET /coordinator with x-forwarded-for redirects to /login", ok ? "" : `got ${r.status} ${r.location}`);
  }

  // From this laptop: the same requests still work.
  const board = await call("GET", "/api/board");
  expect(board, [200], "GET /api/board locally");
  expect(await call("GET", "/api/events?limit=1"), [200], "GET /api/events locally");
  expect(await call("POST", "/api/events?user=coordinator-duty", {}, approve(ghost)), [404], "POST /api/events?user=coordinator-duty locally, fake task");
  // Audio-only messages get a fixed reply after the demo gate: no Anthropic spend, no write, even if the gate breaks.
  expect(await call("POST", "/api/chat?user=volunteer-callback", {}, { audioBase64: "AAAA" }), [200], "POST /api/chat?user=volunteer-callback locally");
  {
    const r = await call("GET", "/coordinator?user=coordinator-duty");
    line(r.status === 200, "GET /coordinator locally", r.status === 200 ? "" : `got ${r.status} ${r.location}`);
  }

  // The role rule: a volunteer cannot approve a real task.
  {
    const tasks = (board.json?.tasks ?? []) as { _id?: string }[];
    const real = tasks.find((t) => typeof t._id === "string")?._id;
    if (!real) console.log("note no task on the board, the volunteer approval is checked against a fake task only");
    expect(await call("POST", "/api/events?user=volunteer-callback", {}, approve(real ?? ghost, fakeDesk)),
      real ? [403] : [403, 404], `volunteer-callback approving ${real ? "a real task" : "a fake task"} is refused`);
  }

  console.log(failed ? `${failed} check${failed > 1 ? "s" : ""} failed` : "all checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// #16 (UI-1, INV-5, VOX-1): /field and /talk on USWDS at 360 by 800, the narrowest phone we support.
// Headless only. The desk answers from fixtures, /api/chat answers 503 (the model is down) and
// POST /api/events is caught here, so no click reaches a real desk. Screenshots land in
// test-results/phone/ and report/phone/.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fixtureDesk } from "./desk";

test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

type Body = { type: string; payload: Record<string, unknown> };

// Every request the page makes, so a test can say what it did not send.
function watchNetwork(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  return urls;
}

// The model is down: every chat call fails. POSTed events are kept and answered 200.
async function modelDownDesk(page: Page, which: "field" | "board" = "field") {
  const events: Body[] = [];
  await fixtureDesk(page, which);
  await page.route("**/api/chat**", (route) => route.fulfill({ status: 503, json: { error: "model unavailable" } }));
  await page.route("**/api/events**", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    events.push(route.request().postDataJSON() as Body);
    return route.fulfill({ json: { ok: true, id: "ev-test" } });
  });
  return events;
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
}

async function noSpeechRequest(urls: string[]) {
  const bad = urls.filter((u) => /google|gstatic|speech|transcribe|polly/i.test(new URL(u).hostname + new URL(u).pathname)
    && !/fonts\.(googleapis|gstatic)/.test(u));
  expect(bad).toEqual([]);
}

test.describe("/field at 360 px", () => {
  test("the task card fits the screen and uses USWDS buttons @phone", async ({ page }, info) => {
    await modelDownDesk(page);
    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Your next task", level: 1 })).toBeVisible();
    await expect(page.locator("main button.usa-button").first()).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: info.outputPath("field-card.png"), fullPage: true });
  });

  test("Accept, Decline, Done and Problem post their events with the model down (INV-5)", async ({ page }) => {
    const events = await modelDownDesk(page);
    await page.goto("/field?task=task-9");
    const card = page.locator("main");
    const sent = async (n: number) => expect.poll(() => events.length).toBe(n);

    // Accept: On our way asks for an ETA, then posts accepted.
    await page.getByRole("button", { name: "On our way", exact: true }).click();
    await page.getByRole("button", { name: "10 min" }).click();
    await sent(1);
    expect(events[0]).toMatchObject({ type: "answer", payload: { taskId: "task-9", result: "accepted", etaMinutes: 10 } });
    await expect(card.getByRole("status")).toContainText("Sent");

    // Done, with a note.
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByLabel(/What happened/).fill("Everyone is out");
    await page.getByRole("button", { name: "Send done" }).click();
    await sent(2);
    expect(events[1]).toMatchObject({ type: "answer", payload: { taskId: "task-9", result: "done", note: "Everyone is out" } });
  });

  test("Decline posts declined, Problem posts an incident (INV-5)", async ({ page }, info) => {
    const events = await modelDownDesk(page);
    await page.goto("/field?task=task-9");
    await page.getByRole("button", { name: "Problem", exact: true }).click();
    await page.screenshot({ path: info.outputPath("field-problem.png"), fullPage: true });
    await noSideScroll(page);
    await page.getByRole("button", { name: "Road blocked" }).click();
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toMatchObject({ type: "incident", payload: { kind: "road_blocked", taskId: "task-9" } });

    await page.getByRole("button", { name: "Decline", exact: true }).click();
    await expect.poll(() => events.length).toBe(2);
    expect(events[1]).toMatchObject({ type: "answer", payload: { taskId: "task-9", result: "declined" } });
  });

  test("every action button is thumb sized", async ({ page }) => {
    await modelDownDesk(page);
    await page.goto("/field?task=task-9");
    for (const name of ["On our way", "Arrived", "Done", "Decline", "Problem"]) {
      const b = page.getByRole("button", { name, exact: true });
      await expect(b).toBeVisible();
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("no speech recognition: the text box shows, nothing goes to a speech host (VOX-1)", async ({ page }) => {
    await page.addInitScript(() => Object.assign(window, { webkitSpeechRecognition: undefined, SpeechRecognition: undefined }));
    const urls = watchNetwork(page);
    await modelDownDesk(page);
    await page.goto("/field");
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeDisabled();
    const box = page.getByLabel("Tell your agent");
    await expect(box).toBeVisible();
    await box.fill("which roads are closed");
    await expect(box).toHaveValue("which roads are closed");
    await noSideScroll(page);
    await noSpeechRequest(urls);
  });

  test("dictation asks for on-device recognition and sends no speech request (VOX-1)", async ({ page }) => {
    await page.addInitScript(() => {
      class Fake {
        lang = ""; interimResults = false; continuous = false; processLocally = false;
        onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
        start() { (window as unknown as { __local: boolean }).__local = this.processLocally; }
        stop() {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "how full are the shelters" }], { isFinal: true })] });
          this.onend?.();
        }
      }
      Object.assign(window, { webkitSpeechRecognition: Fake, SpeechRecognition: Fake });
    });
    const urls = watchNetwork(page);
    await modelDownDesk(page);
    await page.goto("/field");
    const hold = page.getByRole("button", { name: "Hold to talk" });
    await hold.scrollIntoViewIfNeeded();
    const b = (await hold.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(page.getByRole("button", { name: "Listening, let go to stop" })).toBeVisible();
    await page.mouse.up();
    await expect(page.getByLabel("Tell your agent")).toHaveValue("how full are the shelters");
    expect(await page.evaluate(() => (window as unknown as { __local: boolean }).__local)).toBe(true);
    await noSpeechRequest(urls);
  });

  test("passes axe (serious and critical) @phone", async ({ page }) => {
    await modelDownDesk(page);
    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Your next task", level: 1 })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("main").analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("/talk at 360 px", () => {
  test("fits the screen, types to the agent, and says so when the model is down @phone", async ({ page }, info) => {
    const urls = watchNetwork(page);
    await modelDownDesk(page, "board");
    await page.goto("/talk");
    await expect(page.locator("main")).toBeVisible();
    // Without a voice service the type box is already open; otherwise it is one tap away.
    const typeInstead = page.getByRole("button", { name: "Type instead" });
    if (await typeInstead.isVisible()) await typeInstead.click();
    const box = page.getByLabel("Message");
    await expect(box).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: info.outputPath("talk.png"), fullPage: true });

    await box.fill("we need blankets at Kale");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/Something went wrong/)).toBeVisible();   // the model is down, the screen still answers
    await noSideScroll(page);
    await noSpeechRequest(urls.filter((u) => !/\/api\/chat/.test(u)));
  });

  test("passes axe (serious and critical) @phone", async ({ page }) => {
    await modelDownDesk(page, "board");
    await page.goto("/talk");
    await expect(page.locator("main")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("main").analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

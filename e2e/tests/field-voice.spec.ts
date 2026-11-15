import { expect, test, type Page } from "@playwright/test";
import { fixtureDesk } from "./desk";

// Field hold to talk on the phone. It only dictates: the phone's speech recognition types into the
// prompt box, nothing is sent until Send, and Send asks the agent the agents tab's way
// (components/agent/askDesk.ts) with the same chart space under the page.
// Headless Chromium cannot recognise speech, so a fake recogniser stands in: it "hears" FAKE_SPEECH
// when the button is let go. /api/chat is answered here, so nothing reaches the agent or the desk.

const FAKE_SPEECH = "how full are the shelters";
const REPLY = "Demo Barınak B is the fullest.";

async function fakeSpeech(page: Page, available = true) {
  await page.addInitScript(({ said, available }) => {
    if (!available) {
      Object.assign(window, { webkitSpeechRecognition: undefined, SpeechRecognition: undefined });
      return;
    }
    class FakeRecognition {
      lang = ""; interimResults = false; continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {
        const result = Object.assign([{ transcript: said }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  }, { said: FAKE_SPEECH, available });
}

type Post = Record<string, unknown>;

async function agentServer(page: Page): Promise<Post[]> {
  const posts: Post[] = [];
  await fixtureDesk(page, "field");
  await page.route("**/api/chat**", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON() as Post);
    return route.fulfill({ json: { reply: REPLY, eventIds: [], actions: [] } });
  });
  return posts;
}

async function holdToTalk(page: Page) {
  const hold = page.getByRole("button", { name: "Hold to talk" });
  await hold.scrollIntoViewIfNeeded();
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Listening, let go to stop" })).toBeVisible();
  await page.mouse.up();
}

test.describe("field hold to talk", () => {
  test("holding only dictates into the prompt box, nothing is sent", async ({ page }) => {
    await fakeSpeech(page);
    const posts = await agentServer(page);
    await page.goto("/field");

    await holdToTalk(page);
    await expect(page.getByLabel("Tell your agent")).toHaveValue(FAKE_SPEECH);
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(0);
  });

  test("Send asks the agent the agents tab's way and the charts show under the page", async ({ page }) => {
    await fakeSpeech(page);
    const posts = await agentServer(page);
    await page.goto("/field");

    await holdToTalk(page);
    await expect(page.getByLabel("Tell your agent")).toHaveValue(FAKE_SPEECH);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ text: FAKE_SPEECH });     // text only: no audio, no spoken reply asked for
    await expect(page.getByText(REPLY)).toBeVisible();
    await expect(page.getByLabel("Tell your agent")).toHaveValue("");
    const charts = page.getByRole("complementary", { name: "Charts" });
    await expect(charts).toBeVisible();
    await expect(charts).toContainText("Shelters");
  });

  test("without speech recognition the button is off and typing still works", async ({ page }) => {
    await fakeSpeech(page, false);
    const posts = await agentServer(page);
    await page.goto("/field");

    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeDisabled();
    await page.getByLabel("Tell your agent").fill("which roads are closed");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ text: "which roads are closed" });
    await expect(page.getByText(REPLY)).toBeVisible();
  });
});

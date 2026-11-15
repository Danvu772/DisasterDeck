import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

// Field voice on the phone: ElevenLabs voice notes, voice agent mode, and the fallback without a key.
// /api/chat is answered here, so no ElevenLabs or Anthropic credit is spent and nothing reaches the desk.
// Chromium gets a fake microphone that plays a WAV on a loop: 1 s of silence, 1.5 s of tone, 2.5 s of
// silence. The voice agent measures the room during the first silence, hears the tone as a sentence and
// sends it when the silence after it is long enough.

function wav(parts: { seconds: number; tone: boolean }[]): Buffer {
  const rate = 16000;
  const samples = parts.flatMap(({ seconds, tone }) =>
    Array.from({ length: Math.round(seconds * rate) }, (_, i) => (tone ? Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)) : 0)));
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const MIC = path.join(tmpdir(), "disaster-desk-fake-mic.wav");
writeFileSync(MIC, wav([{ seconds: 1, tone: false }, { seconds: 1.5, tone: true }, { seconds: 2.5, tone: false }]));
const SILENT_REPLY = `data:audio/wav;base64,${wav([{ seconds: 0.1, tone: false }]).toString("base64")}`;

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${MIC}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

const REPLY = {
  reply: "You have no open tasks right now.",
  heard: "what is my task",
  replyAudio: SILENT_REPLY,
  eventIds: [],
  actions: [{ tool: "ask_desk", summary: "checked your tasks on the desk", ok: true }],
};

type Post = { audioBase64?: string; text?: string; speak?: boolean };

async function voiceServer(page: import("@playwright/test").Page, voice: boolean): Promise<Post[]> {
  const posts: Post[] = [];
  await fixtureDesk(page, "field");
  await page.route("**/api/chat**", (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { voice } });
    posts.push(req.postDataJSON() as Post);
    return route.fulfill({ json: REPLY });
  });
  return posts;
}

test.describe("field voice", () => {
  test("hold to talk sends an ElevenLabs voice note and shows what the agent did", async ({ page }) => {
    const posts = await voiceServer(page, true);
    await page.goto("/field");
    await expect(page.getByText(/^Voice: ElevenLabs\./)).toBeVisible();

    const hold = page.getByRole("button", { name: "Hold to talk" });
    await hold.scrollIntoViewIfNeeded();
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByRole("button", { name: "Recording, let go to send" })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.mouse.up();

    await expect(page.getByText("what is my task")).toBeVisible();
    await expect(page.getByText("You have no open tasks right now.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "checked your tasks on the desk" })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].audioBase64).toMatch(/^data:audio\/[a-z0-9]+/);
    expect(posts[0].speak).toBe(true);
  });

  test("voice agent mode hears a sentence on its own, answers, and turns off", async ({ page }) => {
    const posts = await voiceServer(page, true);
    await page.goto("/field");
    await expect(page.getByText(/^Voice: ElevenLabs\./)).toBeVisible();

    const start = page.getByRole("button", { name: "Start voice agent (hands-free)" });
    await start.scrollIntoViewIfNeeded();
    await start.click();
    await expect(page.getByRole("button", { name: "Voice agent on, tap to stop" })).toHaveAttribute("aria-pressed", "true");
    // Hold to talk is off while the voice agent listens.
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeDisabled();

    // No tap: the tone in the fake microphone is the sentence.
    await expect.poll(() => posts.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(posts[0].audioBase64).toMatch(/^data:audio\/[a-z0-9]+/);
    expect(posts[0].speak).toBe(true);
    // The screen reader announcement says what the agent did. The same line is also in the visible list.
    await expect(page.locator('p[aria-live="polite"]', { hasText: "Done: checked your tasks on the desk" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "checked your tasks on the desk" })).toBeVisible();
    await expect(page.getByText("You have no open tasks right now.")).toBeVisible();

    await page.getByRole("button", { name: "Voice agent on, tap to stop" }).click();
    await expect(page.getByText("Voice agent off.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start voice agent (hands-free)" })).toHaveAttribute("aria-pressed", "false");
  });

  test("without ElevenLabs on the server the phone uses its own speech and the voice agent is off", async ({ page }) => {
    await voiceServer(page, false);
    await page.goto("/field");
    await expect(page.getByText(/^Voice: this phone's own speech\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start voice agent (hands-free)" })).toBeDisabled();
  });
});

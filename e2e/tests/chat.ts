// POST /api/chat saves both lines of every turn to the person's chat history and spends the
// OpenRouter key. So by default the tests answer it here, and the screen still runs its whole path
// (send, show the answer, pick and draw the metric cards). E2E_LIVE_CHAT=1 lets it reach the real agent.
import { expect, type Locator, type Page } from "@playwright/test";

export const LIVE_CHAT = process.env.E2E_LIVE_CHAT === "1";

export async function stubChat(page: Page) {
  if (LIVE_CHAT) return;
  await page.route("**/api/chat**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { reply: "Test reply from the e2e stub, nothing was saved.", eventIds: [], actions: [] } })
      : route.fallback());
}

// What the chat box may say: the agent's answer, or one of the sentences in components/chatError.ts.
export const ANSWER_OR_ERROR = /Agent:|The desk agent (is not reachable|did not answer)/;

// The dev server can still be hydrating when a page first shows, more so with three workers on it.
// A fill before hydration stays in the box but never reaches React state, so the press does nothing.
// So fill and press again until `taken` shows the screen took the question.
export async function sendQuestion(input: Locator, send: Locator, taken: Locator, text: string) {
  await expect(async () => {
    await input.fill(text);
    await send.click();
    await expect(taken).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

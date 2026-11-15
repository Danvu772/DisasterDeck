import { expect, test } from "@playwright/test";
import { ANSWER_OR_ERROR, sendQuestion, stubChat } from "./chat";
import { fixtureDesk } from "./desk";

const URL = "/agent?user=volunteer-callback";

test.describe("agent", () => {
  test("loads with the desk feed @smoke", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto(URL);
    await expect(page.getByRole("heading", { name: "Your agent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Desk feed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Desk feed" }).locator("xpath=..").getByRole("listitem").first()).toBeVisible();
  });

  test("a feed item opens its report and Back returns", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto(URL);
    const feed = page.getByRole("heading", { name: "Desk feed" }).locator("xpath=..");
    await feed.getByRole("listitem").first().getByRole("button").click();
    await expect(page).toHaveURL(/event=/);
    await expect(page.getByRole("heading", { name: "What the desk did" })).toBeVisible();
    await page.getByRole("button", { name: "Back to feed" }).click();
    await expect(page.getByRole("heading", { name: "Desk feed" })).toBeVisible();
    await expect(page).not.toHaveURL(/event=/);
  });

  test("a chat question gets an answer and a metric chart", async ({ page }) => {
    await fixtureDesk(page);
    await stubChat(page);
    await page.goto(URL);
    const agent = page.getByRole("region", { name: "Your agent" });
    const before = await agent.getByText("Agent:").count();
    const q = "how full are the shelters?";
    // Taken means the person's own line is in the chat.
    await sendQuestion(agent.getByLabel("Message your agent"), agent.getByRole("button", { name: "Send" }),
      agent.getByText(q), q);
    // The answer, or the error sentence, lands as a new Agent line.
    await expect(agent.getByText(ANSWER_OR_ERROR)).toHaveCount(before + 1, { timeout: 45_000 });
    // Inline under the answer today. Once t42 lands the chart may live in the animation space instead.
    await expect(page.getByRole("article", { name: "Shelter beds used of total" }).first()).toBeVisible();
  });
});

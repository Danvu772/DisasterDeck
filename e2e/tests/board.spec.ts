import { expect, test } from "@playwright/test";
import { ANSWER_OR_ERROR, sendQuestion, stubChat } from "./chat";
import { fixtureDesk } from "./desk";

const list = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Shared priority list" }).getByRole("button");
const detail = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "Selected record" });

test.describe("board", () => {
  // Live desk, whatever it holds. Only the layout and the header pill are checked.
  test("loads with the status pill, list, map and detail @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("status")).toBeVisible();
    await expect(page.getByRole("region", { name: "Shared priority list" })).toBeVisible();
    await expect(page.locator(".maplibregl-map")).toBeVisible();
    await expect(detail(page)).toBeVisible();
  });

  test("clicking a list row selects it in the detail column", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/");
    // The page first draws the live desk from the server, then the first poll swaps in the fixtures.
    // Wait for a fixture-only card, or the key below belongs to a row that is about to vanish.
    await expect(page.locator('[data-card="site:site-52"]')).toBeVisible();
    // The second row, because with nothing open the detail column already shows the first act-now one.
    const row = list(page).nth(1);
    const key = (await row.getAttribute("data-card"))!;
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`open=${encodeURIComponent(key)}`));
    // The panel names the record in words (no ids on screen): the row's first line is its title.
    const title = (await row.innerText()).split("\n").map((l) => l.trim()).find(Boolean)!;
    await expect(detail(page).getByText(title).first()).toBeVisible();
  });

  test("?open= deep link opens that record", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/?open=shelter:sh-b");
    await expect(page.locator('[data-card="shelter:sh-b"]')).toHaveAttribute("aria-pressed", "true");
    await expect(detail(page).getByText("Shelter B, mosque hall").first()).toBeVisible();
    await expect(detail(page).getByRole("link", { name: "Open on the full map" })).toBeVisible();
  });

  test("Ask the desk about shelters shows a shelter metric card", async ({ page }) => {
    await fixtureDesk(page);
    await stubChat(page);
    await page.goto("/");
    const ask = page.getByRole("region", { name: "Ask the desk" });
    await sendQuestion(ask.getByLabel("Ask the desk"), ask.getByRole("button", { name: "Ask" }),
      ask.getByText(/^Asking$|Agent:|The desk agent/).first(), "how full are the shelters?");
    await expect(ask.getByText(ANSWER_OR_ERROR).first()).toBeVisible({ timeout: 45_000 });
    await expect(ask.getByRole("article", { name: "Shelter beds used of total" })).toBeVisible();
  });
});

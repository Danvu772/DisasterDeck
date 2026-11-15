import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

test.describe("map", () => {
  test("renders markers and the legend @smoke", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Map", level: 1 })).toBeVisible();
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
    expect(await page.locator(".maplibregl-marker").count()).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    await expect(page.getByText("Can wait").first()).toBeVisible();
  });

  test("?focus= selects that record", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/map?focus=site:site-57");
    await expect(page.locator('[data-key="site:site-57"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
  });
});

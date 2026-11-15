import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

test.describe("map", () => {
  test("renders markers and the legend @smoke", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Sites and problems" })).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
    expect(await page.locator(".leaflet-marker-icon").count()).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Legend", exact: true }).click();
    await expect(page.getByText("Danger to life").first()).toBeVisible();
  });

  test("?focus= selects that record", async ({ page }) => {
    await fixtureDesk(page);
    await page.goto("/map?focus=site:site-57");
    // The map list has no aria state for the pick, the selected row is the one with the highlight.
    const row = page.getByRole("listitem").filter({ has: page.getByText("site site-57", { exact: true }) });
    await expect(row).toHaveClass(/bg-primary-lighter/);
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
  });
});

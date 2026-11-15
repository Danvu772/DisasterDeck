import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

// Phone project only. The action buttons are only looked at, never pressed (and fixtureDesk refuses any write).
test.describe("field", () => {
  test("shows the task card and the big buttons @smoke", async ({ page }) => {
    await fixtureDesk(page, "field");
    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Your next task", level: 1 })).toBeVisible();
    for (const name of ["On our way", "Arrived", "Done", "Problem"]) {
      const b = page.getByRole("button", { name, exact: true });
      await expect(b).toBeVisible();
      // Big means thumb-sized.
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("lists the other tasks when there are several", async ({ page }) => {
    await fixtureDesk(page, "field");
    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Your next task", level: 1 })).toBeVisible();
    const others = page.getByRole("heading", { name: /^Your other tasks \(\d+\)$/ });
    await expect(others).toBeVisible();
    const n = Number((await others.textContent())!.match(/\((\d+)\)/)![1]);
    expect(n).toBeGreaterThan(0);
  });
});

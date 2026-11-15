import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

test.describe("coordinator", () => {
  // Live desk. The four sections render whatever it holds.
  test("loads with its sections @smoke", async ({ page }) => {
    await page.goto("/coordinator");
    await expect(page.getByRole("heading", { name: "Coordinator", level: 2 })).toBeVisible();
    for (const name of ["Decisions", "Nobody fits", "Handed out without you", "Problems in the field"]) {
      await expect(page.getByRole(name === "Problems in the field" ? "complementary" : "region", { name })).toBeVisible();
    }
  });

  test("the Modify picker opens and lists people", async ({ page }) => {
    await fixtureDesk(page, "coordinator");
    await page.goto("/coordinator");
    const decisions = page.getByRole("region", { name: "Decisions" });
    const modify = decisions.getByRole("button", { name: "Modify" }).first();
    await expect(modify).toBeVisible();
    // Modify only opens the picker. Approve, Reject and "Approve with this person" post to the desk, so they stay untouched.
    await modify.click();
    const picker = decisions.getByRole("combobox", { name: /Send someone else/ }).first();
    await expect(picker).toBeVisible();
    expect(await picker.locator("option").count()).toBeGreaterThan(0);
  });
});

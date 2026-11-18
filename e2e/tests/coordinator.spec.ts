import { expect, test } from "@playwright/test";
import { fixtureDesk } from "./desk";

test.describe("coordinator", () => {
  // Live desk. The five sections render whatever it holds.
  test("loads with its sections @smoke", async ({ page }) => {
    await page.goto("/coordinator");
    await expect(page.getByRole("heading", { name: "Coordinator", level: 1 })).toBeVisible();
    const complementary = ["Problems in the field"];
    for (const name of ["Waiting for your decision", "Nobody fits these tasks", "Handed out without you", "Rank the board", ...complementary]) {
      await expect(page.getByRole(complementary.includes(name) ? "complementary" : "region", { name })).toBeVisible();
    }
  });

  test("the Modify picker opens and lists people", async ({ page }) => {
    await fixtureDesk(page, "coordinator");
    await page.goto("/coordinator");
    const decisions = page.getByRole("region", { name: "Waiting for your decision" });
    const modify = decisions.getByRole("button", { name: "Modify" }).first();
    await expect(modify).toBeVisible();
    // Modify only opens the picker. Approve, Reject and "Approve with this person" post to the desk, so they stay untouched.
    await modify.click();
    const picker = decisions.getByRole("combobox", { name: /Send someone else/ }).first();
    await expect(picker).toBeVisible();
    expect(await picker.locator("option").count()).toBeGreaterThan(0);
  });
});

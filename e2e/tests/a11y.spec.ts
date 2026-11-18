// UI-1 (D-0001): the shell and /login use USWDS and pass axe with no serious or critical violations.
// The shell (skip link, header, nav, footer) is checked on each of the six screens; /login is checked
// whole. The screens' own content is #16 to #18 and is not in scope here.
// Runs without a database: DEMO_MODE=1 and a placeholder AUTH_SECRET (playwright.a11y.config.ts).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SCREENS = [
  { path: "/", label: "Desk" },
  { path: "/field", label: "Field" },
  { path: "/talk", label: "Talk" },
  { path: "/coordinator", label: "Coordinator" },
  { path: "/map", label: "Map" },
  { path: "/ops", label: "Ops" },
];

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axe(page: Page, include?: string[]) {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  for (const sel of include ?? []) builder = builder.include(sel);
  const { violations } = await builder.analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  // The message lists every serious or critical rule with the elements it hit.
  expect(bad.map((v) => `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)).toEqual([]);
  return violations;
}

const SHELL = ["a.usa-skipnav", "header.usa-header", "footer.usa-footer"];

test.describe("UI-1 shell", () => {
  for (const s of SCREENS) {
    test(`${s.label} (${s.path}): USWDS shell passes axe @a11y`, async ({ page }) => {
      await page.goto(s.path);
      const header = page.locator("header.usa-header");
      await expect(header).toBeVisible();
      await expect(page.locator("footer.usa-footer")).toHaveCount(1);
      // Not a .gov site: no "official website of the United States government" banner.
      await expect(page.locator(".usa-banner")).toHaveCount(0);
      await expect(page.getByText(/official website of the United States government/i)).toHaveCount(0);

      const nav = page.getByRole("navigation", { name: "Primary" });
      const links = nav.getByRole("link");
      await expect(links).toHaveText(SCREENS.map((x) => x.label));
      await expect(nav.getByRole("link", { name: s.label, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

      await axe(page, SHELL);
    });
  }

  test("the skip link is the first stop and moves focus to the screen @a11y", async ({ page }) => {
    await page.goto("/ops");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    // On screen, not just in the DOM: USWDS slides it down from above the page.
    await expect.poll(async () => (await skip.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("dark theme: the shell keeps its USWDS colours and passes axe @a11y", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("desk.theme", "dark"));
    await page.goto("/coordinator");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("header.usa-header")).toBeVisible();
    await axe(page, SHELL);
  });

  test("phone: the Menu button opens the USWDS drawer, which passes axe @a11y", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/map");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Desk" })).toBeHidden();
    // Everything in the header fits the phone's width (WCAG 1.4.10 reflow).
    const overflow = await page.locator("header.usa-header .usa-nav-container").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(nav.getByRole("link", { name: "Desk" })).toBeVisible();
    await axe(page, SHELL);
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("link", { name: "Desk" })).toBeHidden();
  });
});

test.describe("UI-1 login", () => {
  test("/login is USWDS and passes axe @a11y", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to Disaster Deck" })).toBeVisible();
    await expect(page.locator("button.usa-button[type=submit]")).toHaveText("Continue with SSOJet");
    await axe(page);
  });

  test("/login with an error shows a USWDS error alert and passes axe @a11y", async ({ page }) => {
    await page.goto("/login?error=AccessDenied");
    const alert = page.locator(".usa-alert.usa-alert--error");
    await expect(alert).toContainText("Your account is not allowed to sign in to this desk.");
    await axe(page);
  });
});

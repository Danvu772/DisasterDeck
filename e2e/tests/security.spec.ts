import { expect, test } from "@playwright/test";

// A request that looks like it came through a tunnel or proxy must sign in, even on this laptop.
const FROM_OUTSIDE = { "x-forwarded-for": "1.2.3.4" };

test.describe("security", () => {
  test("a proxied visit to /coordinator ends on /login @smoke", async ({ page }) => {
    await page.setExtraHTTPHeaders(FROM_OUTSIDE);
    await page.goto("/coordinator");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a proxied GET /api/board answers 401 @smoke", async ({ request }) => {
    const r = await request.get("/api/board", { headers: FROM_OUTSIDE });
    expect(r.status()).toBe(401);
  });

  test("the same two work from this laptop @smoke", async ({ page, request }) => {
    expect((await request.get("/api/board")).status()).toBe(200);
    await page.goto("/coordinator");
    await expect(page).toHaveURL(/\/coordinator/);
  });
});

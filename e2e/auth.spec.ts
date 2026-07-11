import { test, expect } from "@playwright/test";

/**
 * The critical auth journey in a REAL browser — the layer that would have
 * caught the static-prerender login loop (curl set the cookie header by hand;
 * a browser + middleware + Secure-cookie-over-localhost reproduces the loop).
 *
 * The e2e server starts on a throwaway MATRIX_DATA_DIR, so on first run there
 * are zero users → the app shows first-run owner bootstrap.
 */

const OWNER = { email: "e2e-owner@test.local", password: "e2e-owner-pw-123" };

test.describe.serial("auth journey", () => {
  test("first run shows owner bootstrap, and bootstrap lands on the dashboard (no loop)", async ({
    page,
  }) => {
    await page.goto("/dashboard"); // unauthenticated → should redirect to /login
    await expect(page).toHaveURL(/\/login/);

    // Fresh DB → bootstrap mode.
    await expect(page.getByText(/set up your account/i)).toBeVisible();

    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /create account/i }).click();

    // MUST land on the dashboard and STAY (the loop bug would bounce back to /login).
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/dashboard/); // still here, not looped
  });

  test("owner can sign in (owner exists after bootstrap)", async ({ page }) => {
    // Each test gets a fresh browser context (no carried cookies), and the owner
    // now exists from the bootstrap test → /login shows the sign-in form.
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await page.locator(`input[type="email"]`).fill(OWNER.email);
    await page.locator(`input[type="password"]`).fill(OWNER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // And it STAYS on the dashboard (no login↔dashboard loop).
    await page.waitForTimeout(1200);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator(`input[type="email"]`).fill(OWNER.email);
    await page.locator(`input[type="password"]`).fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

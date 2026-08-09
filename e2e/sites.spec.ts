import { test, expect, type Page } from "@playwright/test";

const OWNER = { email: "e2e-owner@test.local", password: "e2e-owner-pw-123" };

/**
 * Navigates to /dashboard/sites and, if redirected to /login (no session),
 * handles both first-run bootstrap and existing-owner sign-in so the caller
 * always ends up authenticated.
 */
async function ensureAuth(page: Page) {
  await page.goto("/dashboard/sites", { waitUntil: "commit" });
  // Allow the middleware / client-side redirect to settle.
  await page.waitForTimeout(500);

  if (!page.url().includes("/login")) return; // already authenticated

  const bootstrap = page.getByText(/set up your account/i);
  const isBootstrap = await bootstrap.isVisible({ timeout: 2000 }).catch(() => false);

  await page.locator('input[type="email"]').fill(OWNER.email);
  await page.locator('input[type="password"]').fill(OWNER.password);

  if (isBootstrap) {
    await page.getByRole("button", { name: /create account/i }).click();
  } else {
    await page.getByRole("button", { name: /sign in/i }).click();
  }
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe("Sites page", () => {
  test("renders sites page with 3 domain cards", async ({ page }) => {
    await ensureAuth(page);
    await page.goto("/dashboard/sites");

    await expect(page.locator("text=zbautomations.ie")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=matrix.zbautomations.ie")).toBeVisible();
    await expect(page.locator("text=builder.zbautomations.ie")).toBeVisible();
  });

  test("site detail page renders for zbautomations.ie", async ({ page }) => {
    await ensureAuth(page);
    await page.goto("/dashboard/sites/zbautomations.ie");

    // Renders the domain as a heading and has a back link.
    await expect(page.locator("h1")).toContainText("zbautomations.ie");
    await expect(page.locator("text=Back to Sites")).toBeVisible();
    // Should render metric tiles (the loading state or values).
    await expect(page.locator("text=Unique Visitors (24h)")).toBeVisible({ timeout: 10_000 });
  });

  test("analytics settings page renders", async ({ page }) => {
    await ensureAuth(page);
    await page.goto("/dashboard/settings/analytics");

    // PostHog Project ID input field
    await expect(page.locator("text=PostHog Project ID")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("e.g. 12345")).toBeVisible();
    // Save and Test Connection buttons
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /test connection/i })).toBeVisible();
  });
});

test.describe("Analytics API", () => {
  test("returns 503 when PostHog not configured (trends metric)", async ({ page }) => {
    await ensureAuth(page);

    // Use browser-context fetch so the session cookie is sent.
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/analytics?metric=trends");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("PostHog not configured");
  });

  test("returns placeholder data for summary metric", async ({ page }) => {
    await ensureAuth(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/analytics?metric=summary&domain=zbautomations.ie");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("visitors24h");
    expect(result.body).toHaveProperty("placeholder", true);
  });
});

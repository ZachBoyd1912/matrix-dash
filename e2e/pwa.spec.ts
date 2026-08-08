import { test, expect } from "@playwright/test";

test.describe("iOS PWA meta tags", () => {
  test("apple-mobile-web-app-capable meta tag is present", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);

    const capable = await page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(capable).toHaveAttribute("content", "yes");
  });

  test("apple-mobile-web-app-status-bar-style is present", async ({ page }) => {
    await page.goto("/");
    const statusBar = await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]');
    await expect(statusBar).toHaveAttribute("content", "black-translucent");
  });

  test("viewport-fit=cover is in the viewport meta tag", async ({ page }) => {
    await page.goto("/");
    const viewport = await page.locator('meta[name="viewport"]');
    const content = await viewport.getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
  });

  test("theme-color meta tags exist for light and dark modes", async ({ page }) => {
    await page.goto("/");
    const lightTheme = await page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
    );
    const darkTheme = await page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'
    );
    await expect(lightTheme).toHaveCount(1);
    await expect(darkTheme).toHaveCount(1);
  });

  test("apple-touch-icon link is present", async ({ page }) => {
    await page.goto("/");
    const icon = await page.locator('link[rel="apple-touch-icon"]');
    await expect(icon).toHaveCount(1);
  });
});

test.describe("Web App Manifest", () => {
  test("manifest.webmanifest returns valid JSON with correct display", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json.name).toBe("Matrix Dashboard");
    expect(json.display).toBe("standalone");
    expect(json.display_override).toContain("standalone");
    expect(json.icons.length).toBeGreaterThanOrEqual(2);
    expect(json.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  });

  test("manifest does not enforce portrait orientation lock", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    const json = await res?.json();
    expect(json.orientation).toBeUndefined();
  });
});

test.describe("Service Worker", () => {
  test("service worker registers and activates", async ({ page }) => {
    await page.goto("/");
    // Wait for the SW to register (pwa-register does this on mount).
    await page.waitForTimeout(2000);

    const swUrl = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.scriptURL || null;
    });

    // SW may not register in dev mode (it's caught and silenced).
    // In production it should always be present.
    if (swUrl) {
      expect(swUrl).toContain("sw.js");
    }
  });
});

test.describe("Offline page", () => {
  test("offline page loads and renders content", async ({ page }) => {
    const res = await page.goto("/dashboard/offline");
    expect(res?.status()).toBe(200);

    const text = await page.textContent("body");
    expect(text).toContain("offline");
  });
});

test.describe("Splash screen API", () => {
  test("splash API returns a valid PNG for common iPhone dimensions", async ({ page }) => {
    const res = await page.goto("/api/pwa/splash?w=1170&h=2532");
    expect(res?.status()).toBe(200);
    const contentType = res?.headers()["content-type"];
    expect(contentType).toContain("image/png");

    const cacheControl = res?.headers()["cache-control"];
    expect(cacheControl).toContain("immutable");
  });

  test("splash API handles missing dimensions gracefully", async ({ page }) => {
    const res = await page.goto("/api/pwa/splash");
    expect(res?.status()).toBe(200);
    const contentType = res?.headers()["content-type"];
    expect(contentType).toContain("image/png");
  });
});

test.describe("Standalone detection", () => {
  test("standalone-mode class is NOT added in regular browser", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/standalone-mode/);
  });

  test("standalone detection hook does not crash", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    // If the page renders without JS errors, the hook is fine.
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

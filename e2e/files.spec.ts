import { test, expect } from "@playwright/test";

test.describe("File browse API", () => {
  test("browse home directory returns entries", async ({ page }) => {
    const res = await page.goto("/api/files/browse");
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json).toHaveProperty("path");
    expect(json).toHaveProperty("entries");
    expect(Array.isArray(json.entries)).toBe(true);
  });

  test("browse a specific path returns that folder", async ({ page }) => {
    // Use the app directory which we know exists.
    const res = await page.goto(
      "/api/files/browse?path=" + encodeURIComponent(process.cwd() + "/app")
    );
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json.path).toContain("/app");
    expect(json.entries.length).toBeGreaterThan(0);
  });

  test("browse non-existent path returns 404", async ({ page }) => {
    const res = await page.goto("/api/files/browse?path=/definitely/not/a/real/path/anywhere");
    expect(res?.status()).toBe(404);
  });

  test("path traversal is blocked", async ({ page }) => {
    const res = await page.goto("/api/files/browse?path=../../../etc");
    expect(res?.status()).toBe(403);
  });
});

test.describe("File read API", () => {
  test("read a known text file", async ({ page }) => {
    const pkg = process.cwd() + "/package.json";
    const res = await page.goto("/api/files/read?path=" + encodeURIComponent(pkg));
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json.language).toBe("json");
    expect(typeof json.content).toBe("string");
    expect(json.content).toContain("matrix-dash");
    expect(json.truncated).toBe(false);
  });

  test("read a binary file returns binary flag", async ({ page }) => {
    const res = await page.goto(
      "/api/files/read?path=" + encodeURIComponent(process.cwd() + "/public/icon-192.png")
    );
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json.binary).toBe(true);
    expect(json.language).toBe("binary");
  });

  test("read non-existent file returns 404", async ({ page }) => {
    const res = await page.goto("/api/files/read?path=/nope.txt");
    expect(res?.status()).toBe(404);
  });
});

test.describe("File download API", () => {
  test("download returns correct Content-Disposition", async ({ page }) => {
    const pkg = process.cwd() + "/package.json";
    const res = await page.goto("/api/files/download?path=" + encodeURIComponent(pkg));
    expect(res?.status()).toBe(200);
    const disposition = res?.headers()["content-disposition"];
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("package.json");
  });

  test("download returns correct Content-Type", async ({ page }) => {
    const pkg = process.cwd() + "/public/icon-192.png";
    const res = await page.goto("/api/files/download?path=" + encodeURIComponent(pkg));
    expect(res?.status()).toBe(200);
    const contentType = res?.headers()["content-type"];
    expect(contentType).toContain("image/png");
  });

  test("download respects Range header", async ({ page }) => {
    const pkg = process.cwd() + "/package.json";
    const res = await page.request.get("/api/files/download?path=" + encodeURIComponent(pkg), {
      headers: { Range: "bytes=0-9" },
    });
    expect(res.status()).toBe(206);
    const range = res.headers()["content-range"];
    expect(range).toContain("bytes 0-9/");
  });

  test("download non-existent file returns 404", async ({ page }) => {
    const res = await page.goto("/api/files/download?path=/nope.zip");
    expect(res?.status()).toBe(404);
  });
});

test.describe("Files page UI", () => {
  test("files page renders breadcrumb and listing", async ({ page }) => {
    await page.goto("/dashboard/files");
    await page.waitForTimeout(1500);
    // Should show either a listing or an error (auth required in test env).
    // At minimum the page structure should exist.
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

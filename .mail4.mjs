import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://localhost:9222");
const ctx = browser.contexts()[0];
for (const p of ctx.pages())
  if (p.url().includes("matrix.zbautomations.ie")) {
    try {
      await p.close();
    } catch {}
  }
const page = await ctx.newPage();
await page.goto("https://matrix.zbautomations.ie/dashboard/email", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(10000);

const prog = await page.evaluate(async () => {
  const rows = await (await fetch("/api/emails?folder=inbox")).json();
  return {
    total: rows.length,
    markup: rows.filter((r) => (r.body || "").trim().startsWith("<")).length,
  };
});
console.log(`BACKFILL: ${prog.markup} of ${prog.total} previews still markup`);

await page.locator('button:has-text("PU Prime")').first().click();
await page.waitForTimeout(11000);
await page.locator('button:has-text("Show images")').first().click();
await page.waitForTimeout(10000);
const s = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="Message body"]');
  const doc = f?.getAttribute("srcdoc") ?? "";
  return {
    frameBg: f?.style?.background,
    htmlBg: (doc.match(/html \{[^}]*background: ([^;]+);/) || [])[1],
    bodyBg: (doc.match(/body \{ margin: 0; background: ([^;]+);/) || [])[1],
    remote: (doc.match(/src="https?:\/\//gi) || []).length,
  };
});
console.log("PU Prime (designed, dark):", JSON.stringify(s));
await page.screenshot({ path: process.env.SCRATCH + "/final-designed.png" });

// A plain-text-ish email for the themed path.
await page.locator('button:has-text("vercel[bot]")').first().click();
await page.waitForTimeout(9000);
const v = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="Message body"]');
  const doc = f?.getAttribute("srcdoc") ?? "";
  return {
    hasIframe: !!f,
    frameBg: f?.style?.background,
    htmlBg: (doc.match(/html \{[^}]*background: ([^;]+);/) || [])[1],
  };
});
console.log("vercel[bot]:", JSON.stringify(v));
await page.screenshot({ path: process.env.SCRATCH + "/final-themed.png" });
await browser.close();

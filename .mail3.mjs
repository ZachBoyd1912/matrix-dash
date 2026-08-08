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

// Backfill progress (daemon task, every 2 min).
const prog = await page.evaluate(async () => {
  const rows = await (await fetch("/api/emails?folder=inbox")).json();
  return {
    total: rows.length,
    markup: rows.filter((r) => (r.body || "").trim().startsWith("<")).length,
  };
});
console.log(`BACKFILL: ${prog.markup} of ${prog.total} inbox previews still markup`);

const row = page.locator('button:has-text("PU Prime")').first();
await row.waitFor({ timeout: 60000 });
await row.click();
await page.waitForTimeout(11000);

const read = async (label) =>
  page.evaluate((l) => {
    const f = document.querySelector('iframe[title="Message body"]');
    const doc = f?.getAttribute("srcdoc") ?? "";
    const sec = [...document.querySelectorAll("section")].pop();
    return {
      label: l,
      subject: sec?.querySelector("h2")?.textContent,
      imgs: (doc.match(/<img/gi) || []).length,
      blocked: (doc.match(/R0lGODlhAQABAIAAAAAAAP/g) || []).length,
      remote: (doc.match(/src="https?:\/\//gi) || []).length,
      themedBg: f?.style?.background,
    };
  }, label);

console.log(JSON.stringify(await read("before"), null, 0));
await page.screenshot({ path: process.env.SCRATCH + "/pu-blocked.png" });

const show = page.locator('button:has-text("Show images")').first();
await show.click();
await page.waitForTimeout(10000);
console.log(JSON.stringify(await read("after"), null, 0));
await page.screenshot({ path: process.env.SCRATCH + "/pu-images.png" });
await browser.close();

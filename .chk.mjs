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
await page.waitForTimeout(7000);
const r = await page.evaluate(async () => {
  const rows = await (await fetch("/api/emails?folder=inbox")).json();
  const bad = rows.filter((x) => (x.body || "").trim().startsWith("<"));
  return {
    total: rows.length,
    markup: bad.length,
    sample: bad.slice(0, 3).map((b) => b.body.slice(0, 50)),
  };
});
console.log(`still markup: ${r.markup} of ${r.total}`);
r.sample.forEach((s) => console.log("   ", JSON.stringify(s)));
await browser.close();

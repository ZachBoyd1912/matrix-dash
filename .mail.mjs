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

const t0 = Date.now();
const info = await page.evaluate(async () => {
  const res = await fetch("/api/emails?folder=inbox");
  const text = await res.text();
  const rows = JSON.parse(text);
  return {
    status: res.status,
    payloadKB: Math.round(text.length / 1024),
    count: rows.length,
    maxBody: Math.max(...rows.map((r) => (r.body || "").length)),
    withAttachments: rows.filter((r) => r.hasAttachments).length,
    stillMarkup: rows.filter((r) => (r.body || "").trim().startsWith("<")).length,
    sample: rows
      .slice(0, 4)
      .map(
        (r) =>
          `${r.fromAddr.slice(0, 34).padEnd(36)}${JSON.stringify((r.body || "").replace(/\s+/g, " ").slice(0, 58))}`
      ),
  };
});
console.log(
  `LIST: ${info.status} | ${info.count} msgs | ${info.payloadKB}KB | max body ${info.maxBody} chars | ${info.withAttachments} w/ attachments | ${info.stillMarkup} still markup | ${Date.now() - t0}ms`
);
info.sample.forEach((s) => console.log("  •", s));
await page.screenshot({ path: process.env.SCRATCH + "/mail-list.png" });
await browser.close();

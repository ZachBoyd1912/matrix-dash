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

// The first load also runs a slice of the backfill, so give the list time.
await page
  .waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="virtuoso-item-list"] button, [data-index] button')
        .length > 0,
    { timeout: 120000 }
  )
  .catch(() => console.log("(list selector did not resolve; continuing)"));
await page.waitForTimeout(4000);

const info = await page.evaluate(async () => {
  const res = await fetch("/api/emails?folder=inbox");
  const rows = await res.json();
  return {
    count: rows.length,
    withAttachments: rows.filter((r) => r.attachments?.length).length,
    previews: rows.slice(0, 5).map((r) => ({
      from: r.fromAddr.slice(0, 40),
      preview: (r.body || "").replace(/\s+/g, " ").slice(0, 70),
    })),
    stillMarkup: rows.filter((r) => (r.body || "").trim().startsWith("<")).length,
  };
});
console.log(
  "INBOX:",
  info.count,
  "messages |",
  info.withAttachments,
  "with attachments |",
  info.stillMarkup,
  "previews still starting with '<'"
);
info.previews.forEach((p) => console.log(`  • ${p.from.padEnd(42)} ${JSON.stringify(p.preview)}`));
await page.screenshot({ path: process.env.SCRATCH + "/mail-list.png" });
await browser.close();

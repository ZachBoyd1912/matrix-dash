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
await page.waitForTimeout(9000);

// Find the PU Prime row inside the virtualized message list (not the folder chips).
const row = page.locator('button:has-text("PU Prime")').first();
await row.waitFor({ timeout: 60000 });
await row.click();
await page.waitForTimeout(12000); // detail fetch may refetch HTML from Gmail

const pane = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="Message body"]');
  const sec = [...document.querySelectorAll("section")].pop();
  const t = sec?.textContent ?? "";
  const doc = frame?.getAttribute("srcdoc") ?? "";
  return {
    iframe: !!frame,
    sandbox: frame?.getAttribute("sandbox"),
    srcdocKB: Math.round(doc.length / 1024),
    hasImgTags: (doc.match(/<img/gi) || []).length,
    blockedPixels: (doc.match(/R0lGODlhAQABAIAAAAAAAP/g) || []).length,
    bannerShown: /remote image/i.test(t),
    reply: !!document.querySelector('[aria-label="Reply"]'),
    replyAll: !!document.querySelector('[aria-label="Reply all"]'),
    forward: !!document.querySelector('[aria-label="Forward"]'),
    subject: sec?.querySelector("h2")?.textContent,
  };
});
console.log("READING PANE:", JSON.stringify(pane, null, 1));
await page.screenshot({ path: process.env.SCRATCH + "/mail-blocked.png" });

const show = page.locator('button:has-text("Show images")').first();
if (await show.count()) {
  await show.click();
  await page.waitForTimeout(9000);
  const after = await page.evaluate(() => {
    const doc =
      document.querySelector('iframe[title="Message body"]')?.getAttribute("srcdoc") ?? "";
    return {
      blockedPixels: (doc.match(/R0lGODlhAQABAIAAAAAAAP/g) || []).length,
      remoteImgs: (doc.match(/<img[^>]+src="https?:/gi) || []).length,
    };
  });
  console.log("after Show images:", JSON.stringify(after));
  await page.screenshot({ path: process.env.SCRATCH + "/mail-images.png" });
}
await browser.close();

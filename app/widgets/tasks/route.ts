import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const rows = db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.isDone, false), lte(tasks.createdAt, today + "T23:59:59.999Z")))
    .limit(5)
    .all();

  const items = rows
    .slice(0, 3)
    .map((t) => `<li style="padding:4px 0;font-size:12px;color:#e8e8e8;">☐ ${esc(t.title)}</li>`)
    .join("");
  const more =
    rows.length > 3
      ? `<p style="font-size:11px;color:#666;margin:4px 0 0;">+${rows.length - 3} more</p>`
      : "";

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;background:#0d0d0d;color:#e8e8e8;}h2{font-size:14px;font-weight:600;margin:0 0 8px;color:#888;}ul{list-style:none;padding:0;margin:0;}</style></head><body><h2>Tasks — Today</h2><ul>${items}</ul>${more}${rows.length === 0 ? '<p style="font-size:12px;color:#666;">No tasks today</p>' : ""}</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=300" },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

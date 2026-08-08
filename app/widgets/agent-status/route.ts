import { getDb } from "@/lib/db/client";
import { agentRuns, agentApprovals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getDb();

  const activeRuns = db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.status, "running")))
    .all().length;

  const pendingApprovals = db
    .select({ id: agentApprovals.id })
    .from(agentApprovals)
    .where(eq(agentApprovals.status, "pending"))
    .all().length;

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;background:#0d0d0d;color:#e8e8e8;}h2{font-size:14px;font-weight:600;margin:0 0 12px;color:#888;}.stat{font-size:32px;font-weight:700;margin:0;}.stat.green{color:#34d399;}.stat.amber{color:#fbbf24;}p{margin:4px 0 0;font-size:11px;color:#888;}</style></head><body><h2>Matrix — Agent Status</h2><p class="stat green">${activeRuns}</p><p>agents running</p><p class="stat amber" style="margin-top:8px">${pendingApprovals}</p><p>approvals pending</p></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=300" },
  });
}

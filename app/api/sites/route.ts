import { getDb } from "@/lib/db/client";
import { siteHealth } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withUser(async () => {
  const db = getDb();
  const rows = db.select().from(siteHealth).all();
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      url: r.url,
      label: r.label,
      lastStatus: r.lastStatus,
      lastOkAt: r.lastOkAt,
      lastCheckedAt: r.lastCheckedAt,
      consecutiveFailures: r.consecutiveFailures,
      ok: r.lastStatus !== null && r.lastStatus === r.expectedStatus,
      everChecked: r.lastStatus !== null,
    }))
  );
});

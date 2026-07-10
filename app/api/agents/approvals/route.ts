import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentApprovals, agents } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pending approvals (or just the count with ?count=1 for the topbar badge). */
export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const countOnly = url.searchParams.get("count") === "1";

  const rows = getDb()
    .select()
    .from(agentApprovals)
    .where(eq(agentApprovals.status, "pending"))
    .orderBy(desc(agentApprovals.createdAt))
    .all();

  if (countOnly) return Response.json({ count: rows.length });

  const withAgent = rows.map((r) => {
    const a = getDb()
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, r.agentId))
      .get();
    let input: unknown = {};
    try {
      input = JSON.parse(r.input);
    } catch {
      /* leave {} */
    }
    return { ...r, agentName: a?.name ?? "Agent", input };
  });
  return Response.json(withAgent);
});

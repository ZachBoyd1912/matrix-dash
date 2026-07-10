import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { undoSnapshots, hasSnapshots } from "@/lib/services/agent-snapshots";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ runId: string }>;
}

/**
 * Undo a run's non-repo file changes from its before-copies. Repo changes are
 * reverted via git (the run's branch / commit), surfaced in the "Changes" view;
 * this route handles the before-copy manifest.
 */
export const POST = withUser(async (_req: Request, ctx: Ctx) => {
  const { runId } = await ctx.params;
  const row = getDb()
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (!hasSnapshots(runId)) {
    return Response.json({
      ok: true,
      restored: 0,
      deleted: 0,
      note: "No before-copies for this run.",
    });
  }
  const result = undoSnapshots(runId);
  return Response.json({ ok: true, ...result });
});

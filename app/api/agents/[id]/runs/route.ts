import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = getDb()
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      trigger: agentRuns.trigger,
      dryRun: agentRuns.dryRun,
      urgent: agentRuns.urgent,
      costUsd: agentRuns.costUsd,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      numTurns: agentRuns.numTurns,
      result: agentRuns.result,
      error: agentRuns.error,
      prUrl: agentRuns.prUrl,
      startedAt: agentRuns.startedAt,
      endedAt: agentRuns.endedAt,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, id))
    .orderBy(desc(agentRuns.createdAt))
    .limit(100)
    .all();
  return Response.json(rows.map((r) => ({ ...r, dryRun: !!r.dryRun, urgent: !!r.urgent })));
}

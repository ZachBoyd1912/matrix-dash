import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { cancelRun, isRunActive } from "@/lib/services/agent-runner";
import { parseBlocksJson } from "@/lib/chat/blocks";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ runId: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { runId } = await ctx.params;
  const row = getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    ...row,
    dryRun: !!row.dryRun,
    urgent: !!row.urgent,
    blocks: parseBlocksJson(row.blocks) ?? [],
    isActive: isRunActive(runId),
  });
});

export const POST = withUser(async (req: Request, ctx: Ctx) => {
  const { runId } = await ctx.params;
  let action = "";
  try {
    const body = (await req.json()) as { action?: string };
    action = body.action ?? "";
  } catch {
    /* ignore */
  }
  if (action === "cancel") {
    cancelRun(runId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
});

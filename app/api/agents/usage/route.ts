import { gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Today's agent spend vs the configured daily budgets, for the usage bar. */
export async function GET() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = getDb()
    .select({
      cost: sql<number>`COALESCE(SUM(${agentRuns.costUsd}), 0)`,
      inTok: sql<number>`COALESCE(SUM(${agentRuns.inputTokens}), 0)`,
      outTok: sql<number>`COALESCE(SUM(${agentRuns.outputTokens}), 0)`,
      runs: sql<number>`COUNT(*)`,
    })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, start.toISOString()))
    .get();

  const cost = row?.cost ?? 0;
  const tokens = (row?.inTok ?? 0) + (row?.outTok ?? 0);
  const costBudget = parseFloat(getSetting("agents_daily_cost_budget_usd") ?? "10") || 10;
  const tokenBudget = parseFloat(getSetting("agents_daily_token_budget") ?? "2000000") || 2_000_000;

  return Response.json({
    cost,
    tokens,
    runs: row?.runs ?? 0,
    costBudget,
    tokenBudget,
    costPct: costBudget > 0 ? Math.min(100, (cost / costBudget) * 100) : 0,
    tokenPct: tokenBudget > 0 ? Math.min(100, (tokens / tokenBudget) * 100) : 0,
  });
}

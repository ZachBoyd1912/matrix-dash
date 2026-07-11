import { z } from "zod";
import { eq, or, desc } from "drizzle-orm";
import { requireRunner } from "@/lib/auth/runner-auth";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { agents, agentRuns, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * RPC bridge for the in-SDK agent tools that need SERVER account state. On a
 * device run getDb() resolves to nothing local, so the runner proxies these
 * three tools here; the server runs them in the device user's account context
 * and returns the text result. (See agent-tools.ts for the in-process versions.)
 */

const bodySchema = z.object({
  tool: z.enum(["flagUrgent", "runAgent", "agentStatus"]),
  runId: z.string(),
  args: z.record(z.string(), z.unknown()),
});

function isOwner(userId: string): boolean {
  return (
    getSystemDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
      ?.role === "owner"
  );
}

export async function POST(req: Request) {
  const auth = requireRunner(req);
  if ("response" in auth) return auth.response;
  const userId = auth.device.userId;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid tool call" }, { status: 400 });
  const { tool, runId, args } = parsed.data;

  const ctx = { userId, isOwner: isOwner(userId) };

  if (tool === "flagUrgent") {
    const reason = String(args.reason ?? "");
    runWithUser(ctx, () => {
      getDb().update(agentRuns).set({ urgent: true }).where(eq(agentRuns.id, runId)).run();
    });
    const { notifyAgentEvent } = await import("@/lib/services/agent-notify");
    const agentId = runWithUser(
      ctx,
      () =>
        getDb()
          .select({ a: agentRuns.agentId })
          .from(agentRuns)
          .where(eq(agentRuns.id, runId))
          .get()?.a ?? runId
    );
    await runWithUser(ctx, async () =>
      notifyAgentEvent("agent.run.urgent", { agentId, runId, urgent: true, body: reason }).catch(
        () => {}
      )
    );
    return Response.json({ text: "Urgent notification sent." });
  }

  if (tool === "runAgent") {
    const target = String(args.agent ?? "");
    const prompt = args.prompt ? String(args.prompt) : undefined;
    const result = runWithUser(ctx, () => {
      const row = getDb()
        .select({ id: agents.id })
        .from(agents)
        .where(or(eq(agents.id, target), eq(agents.name, target)))
        .get();
      return row?.id ?? null;
    });
    if (!result) return Response.json({ text: `No agent found matching "${target}".` });
    // startRun re-enters the user's context itself via ALS at call time.
    const { startRun } = await import("@/lib/services/agent-runner");
    const childId = runWithUser(ctx, () =>
      startRun(result, { trigger: "chat", prompt, parentRunId: runId })
    );
    return Response.json({ text: `Started run ${childId} for agent ${target}.` });
  }

  // agentStatus
  const limit = Math.min(20, Math.max(1, Number(args.limit ?? 5)));
  const rows = runWithUser(ctx, () =>
    getDb()
      .select({ id: agentRuns.id, status: agentRuns.status, createdAt: agentRuns.createdAt })
      .from(agentRuns)
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit)
      .all()
  );
  return Response.json({
    text: rows.map((r) => `${r.createdAt} · ${r.status} · run ${r.id}`).join("\n") || "No runs.",
  });
}

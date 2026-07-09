import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { AgentConfig } from "@/types/agents";

/**
 * Per-run in-process MCP tools exposed to an autonomous agent via the Agent SDK:
 *   flagUrgent   – escalate a finding, bypassing digest/quiet-hours
 *   runAgent     – trigger another agent (runtime chaining; depth-capped by policy)
 *   agentStatus  – query recent run outcomes
 *
 * Built per run so the handlers can close over the current runId/agent.
 */
export interface AgentToolContext {
  runId: string;
  agent: AgentConfig;
  chainDepth: number;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

/**
 * Returns an McpSdkServerConfigWithInstance for options.mcpServers. Typed loosely
 * because the SDK's tool() expects a zod-v4 raw shape while the app is on zod v3;
 * the runtime shapes are compatible.
 */
export async function buildAgentToolServer(ctx: AgentToolContext) {
  const { tool, createSdkMcpServer } = await import("@anthropic-ai/claude-agent-sdk");
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const t = tool as unknown as (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<{ content: { type: "text"; text: string }[] }>
  ) => any;

  const flagUrgent = t(
    "flagUrgent",
    "Escalate an urgent finding to the user immediately, bypassing digest and quiet hours. Use only for genuinely urgent issues (e.g. production down).",
    { reason: z.string().describe("Why this is urgent") },
    async ({ reason }: { reason: string }) => {
      getDb().update(agentRuns).set({ urgent: true }).where(eq(agentRuns.id, ctx.runId)).run();
      const { notifyAgentEvent } = await import("@/lib/services/agent-notify");
      await notifyAgentEvent("agent.run.urgent", {
        agentId: ctx.agent.id,
        runId: ctx.runId,
        urgent: true,
        body: reason,
      });
      return text("Urgent notification sent.");
    }
  );

  const runAgent = t(
    "runAgent",
    "Trigger another agent to run. Subject to a chain-depth cap; deep chains require approval.",
    {
      agent: z.string().describe("Target agent id or name"),
      prompt: z.string().optional().describe("Optional task prompt for the agent"),
    },
    async ({ agent, prompt }: { agent: string; prompt?: string }) => {
      const { getDb: db } = await import("@/lib/db/client");
      const { agents } = await import("@/lib/db/schema");
      const { or } = await import("drizzle-orm");
      const target = db()
        .select({ id: agents.id })
        .from(agents)
        .where(or(eq(agents.id, agent), eq(agents.name, agent)))
        .get();
      if (!target) return text(`No agent found matching "${agent}".`);
      const { startRun } = await import("@/lib/services/agent-runner");
      const childId = startRun(target.id, {
        trigger: "chat",
        prompt,
        chainDepth: ctx.chainDepth + 1,
        parentRunId: ctx.runId,
      });
      return text(`Started run ${childId} for agent ${agent}.`);
    }
  );

  const agentStatus = t(
    "agentStatus",
    "Query the most recent agent runs and their outcomes.",
    { limit: z.number().optional().describe("How many recent runs (default 5)") },
    async ({ limit }: { limit?: number }) => {
      const { desc } = await import("drizzle-orm");
      const rows = getDb()
        .select({
          id: agentRuns.id,
          agentId: agentRuns.agentId,
          status: agentRuns.status,
          createdAt: agentRuns.createdAt,
        })
        .from(agentRuns)
        .orderBy(desc(agentRuns.createdAt))
        .limit(Math.min(20, Math.max(1, limit ?? 5)))
        .all();
      return text(
        rows.map((r) => `${r.createdAt} · ${r.status} · run ${r.id}`).join("\n") || "No runs."
      );
    }
  );

  return createSdkMcpServer({
    name: "matrix-agent",
    version: "1.0.0",
    tools: [flagUrgent, runAgent, agentStatus],
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

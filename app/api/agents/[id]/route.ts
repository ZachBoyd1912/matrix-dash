import { eq } from "drizzle-orm";
import cron from "node-cron";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { getAgent, snapshotAgentVersion, agentHasActiveRun } from "@/lib/db/agents";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(100000).optional(),
  model: z.string().max(200).nullable().optional(),
  cwd: z.string().max(2000).nullable().optional(),
  writeAllowlist: z.array(z.string().max(2000)).max(200).optional(),
  skillIds: z.array(z.string()).max(500).optional(),
  mcpServers: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  allowSubagents: z.boolean().optional(),
  mode: z.enum(["triggered", "standing_watch"]).optional(),
  pushMode: z.enum(["direct", "pr"]).nullable().optional(),
  gitAuthorName: z.string().max(200).nullable().optional(),
  gitAuthorEmail: z.string().max(200).nullable().optional(),
  schedule: z.string().max(200).nullable().optional(),
  scheduleEnabled: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
  perRunCostUsd: z.number().nonnegative().nullable().optional(),
  perRunTokens: z.number().int().positive().nullable().optional(),
  maxChainDepth: z.number().int().nonnegative().nullable().optional(),
  deliverables: z
    .object({
      postToChat: z.boolean(),
      fileNote: z.boolean(),
      inDigest: z.boolean(),
    })
    .optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(agent);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!getAgent(id)) return Response.json({ error: "Not found" }, { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.schedule && !cron.validate(d.schedule)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // Snapshot the pre-edit config for the version history before applying.
  snapshotAgentVersion(id);

  // Serialize JSON-column fields; leave everything else as-is.
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    if (k === "writeAllowlist") set.writeAllowlist = JSON.stringify(v);
    else if (k === "skillIds") set.skillIds = JSON.stringify(v);
    else if (k === "mcpServers") set.mcpServers = JSON.stringify(v);
    else if (k === "deliverables") set.deliverables = JSON.stringify(v);
    else set[k] = v;
  }

  getDb().update(agents).set(set).where(eq(agents.id, id)).run();

  // If the schedule changed, re-sync cron (dynamic import avoids a boot-time cycle).
  if (d.schedule !== undefined || d.scheduleEnabled !== undefined) {
    await resyncAgentSchedules();
  }

  return Response.json({ ok: true });
}

/** Re-register agent cron entries. Tolerant of the daemon hook not existing yet (pre-Phase 5). */
async function resyncAgentSchedules(): Promise<void> {
  try {
    const mod = (await import("@/lib/services/daemon")) as {
      syncAgentSchedules?: () => void;
    };
    mod.syncAgentSchedules?.();
  } catch {
    /* daemon may not expose the hook yet */
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!getAgent(id)) return Response.json({ error: "Not found" }, { status: 404 });
  if (agentHasActiveRun(id)) {
    return Response.json(
      { error: "Agent has an active run. Cancel or wait for it to finish before deleting." },
      { status: 409 }
    );
  }
  getDb().delete(agents).where(eq(agents.id, id)).run();
  await resyncAgentSchedules();
  return Response.json({ ok: true });
}

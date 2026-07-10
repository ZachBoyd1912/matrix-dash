import { randomUUID } from "crypto";
import cron from "node-cron";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { agents, agentRuns } from "@/lib/db/schema";
import { listAgents } from "@/lib/db/agents";
import { desc, eq } from "drizzle-orm";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const deliverablesSchema = z
  .object({
    postToChat: z.boolean().optional(),
    fileNote: z.boolean().optional(),
    inDigest: z.boolean().optional(),
  })
  .optional();

const createSchema = z.object({
  name: z.string().min(1).max(200),
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
  deliverables: deliverablesSchema,
});

/** List agents, each with a compact last-run summary. */
export const GET = withUser(async () => {
  const rows = listAgents();
  const withSummary = rows.map((a) => {
    const lastRun = getDb()
      .select({
        id: agentRuns.id,
        status: agentRuns.status,
        createdAt: agentRuns.createdAt,
        costUsd: agentRuns.costUsd,
      })
      .from(agentRuns)
      .where(eq(agentRuns.agentId, a.id))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1)
      .get();
    return { ...a, lastRun: lastRun ?? null };
  });
  return Response.json(withSummary);
});

export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.schedule && !cron.validate(d.schedule)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(agents)
    .values({
      id,
      name: d.name,
      description: d.description ?? "",
      instructions: d.instructions ?? "",
      model: d.model ?? null,
      cwd: d.cwd ?? null,
      writeAllowlist: JSON.stringify(d.writeAllowlist ?? []),
      skillIds: JSON.stringify(d.skillIds ?? []),
      mcpServers: JSON.stringify(d.mcpServers ?? []),
      allowSubagents: d.allowSubagents ?? false,
      mode: d.mode ?? "triggered",
      pushMode: d.pushMode ?? null,
      gitAuthorName: d.gitAuthorName ?? null,
      gitAuthorEmail: d.gitAuthorEmail ?? null,
      schedule: d.schedule ?? null,
      scheduleEnabled: d.scheduleEnabled ?? false,
      isEnabled: d.isEnabled ?? true,
      maxTurns: d.maxTurns ?? null,
      timeoutMs: d.timeoutMs ?? null,
      perRunCostUsd: d.perRunCostUsd ?? null,
      perRunTokens: d.perRunTokens ?? null,
      maxChainDepth: d.maxChainDepth ?? null,
      deliverables: JSON.stringify(
        d.deliverables ?? { postToChat: false, fileNote: false, inDigest: true }
      ),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return Response.json({ id });
});

import { eq } from "drizzle-orm";
import { z } from "zod";
import cron from "node-cron";
import { getDb } from "@/lib/db/client";
import { scheduledJobs } from "@/lib/db/schema";
import { syncScheduledJobs, triggerJobNow } from "@/lib/services/daemon";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().max(500).optional(),
  prompt: z.string().max(100000).optional(),
  cron: z.string().max(200).optional(),
  isEnabled: z.boolean().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.cron && !cron.validate(parsed.data.cron)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }
  getDb().update(scheduledJobs).set(parsed.data).where(eq(scheduledJobs.id, id)).run();
  syncScheduledJobs();
  return Response.json({ ok: true });
}

export async function POST(_req: Request, ctx: Ctx) {
  // Run now.
  const { id } = await ctx.params;
  await triggerJobNow(id);
  const row = getDb().select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).get();
  return Response.json({ ok: true, lastResult: row?.lastResult });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
  syncScheduledJobs();
  return Response.json({ ok: true });
}

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  notes: z.string().max(50000).optional(),
  dueAt: z.string().max(200).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  kind: z.enum(["task", "bug", "error", "feature"]).optional(),
  projectId: z.string().max(200).nullable().optional(),
  kanbanStatus: z
    .enum(["backlog", "planned", "in-progress", "developed", "tested", "completed"])
    .optional(),
  kanbanOrder: z.number().int().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export const PATCH = withUser(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  Object.assign(updates, parsed.data);
  getDb().update(tasks).set(updates).where(eq(tasks.id, id)).run();
  return Response.json({ ok: true });
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getDb().delete(tasks).where(eq(tasks.id, id)).run();
  return Response.json({ ok: true });
});

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  projectId: z.string().nullable().optional(),
  kanbanStatus: z.enum(["backlog", "todo", "in-progress", "review", "done", "ab-test"]).optional(),
  kanbanOrder: z.number().int().optional(),
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
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  Object.assign(updates, parsed.data);
  getDb().update(tasks).set(updates).where(eq(tasks.id, id)).run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(tasks).where(eq(tasks.id, id)).run();
  return Response.json({ ok: true });
}

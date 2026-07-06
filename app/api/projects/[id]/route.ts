import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().max(500).optional(),
  description: z.string().max(50000).optional(),
  purpose: z.string().max(50000).optional(),
  frontend: z.string().max(500).nullable().optional(),
  backend: z.string().max(500).nullable().optional(),
  database: z.string().max(500).nullable().optional(),
  badge: z.string().max(200).optional(),
  path: z.string().max(500).nullable().optional(),
  status: z.string().max(200).optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(row);
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
  getDb()
    .update(projects)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(projects).where(eq(projects.id, id)).run();
  return Response.json({ ok: true });
}

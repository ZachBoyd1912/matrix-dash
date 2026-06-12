import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { skills } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
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
  getDb()
    .update(skills)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(skills.id, id))
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(skills).where(eq(skills.id, id)).run();
  return Response.json({ ok: true });
}

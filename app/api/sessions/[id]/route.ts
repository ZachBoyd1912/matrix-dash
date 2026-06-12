import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().optional(),
  context: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
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
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updates: Partial<typeof sessions.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.context !== undefined)
    updates.context =
      typeof parsed.data.context === "string"
        ? parsed.data.context
        : JSON.stringify(parsed.data.context);

  getDb().update(sessions).set(updates).where(eq(sessions.id, id)).run();
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  return Response.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(sessions).where(eq(sessions.id, id)).run();
  return Response.json({ ok: true });
}

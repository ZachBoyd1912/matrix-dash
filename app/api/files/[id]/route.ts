import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { languageFromPath } from "@/lib/utils/language";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
  language: z.string().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getDb().select().from(files).where(eq(files.id, id)).get();
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
  const updates: Partial<typeof files.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.path !== undefined) {
    updates.path = parsed.data.path;
    if (parsed.data.language === undefined) {
      updates.language = languageFromPath(parsed.data.path);
    }
  }
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.language !== undefined) updates.language = parsed.data.language;

  getDb().update(files).set(updates).where(eq(files.id, id)).run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(files).where(eq(files.id, id)).run();
  return Response.json({ ok: true });
}

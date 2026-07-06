import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { toPublic } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().max(500).optional(),
  apiKey: z.string().max(200).optional(),
  baseUrl: z.string().max(2048).nullable().optional(),
  defaultModel: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getDb().select().from(aiProviders).where(eq(aiProviders.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublic(row));
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

  const db = getDb();
  if (parsed.data.isActive) {
    db.update(aiProviders).set({ isActive: false }).run();
  }
  const updates: Partial<typeof aiProviders.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.apiKey !== undefined) updates.apiKeyEncrypted = encrypt(parsed.data.apiKey);
  if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl;
  if (parsed.data.defaultModel !== undefined) updates.defaultModel = parsed.data.defaultModel;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  if (Object.keys(updates).length > 0) {
    db.update(aiProviders).set(updates).where(eq(aiProviders.id, id)).run();
  }
  const row = db.select().from(aiProviders).where(eq(aiProviders.id, id)).get();
  return Response.json(row ? toPublic(row) : { id });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(aiProviders).where(eq(aiProviders.id, id)).run();
  return Response.json({ ok: true });
}

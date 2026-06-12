import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessionMessages, sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  providerId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = getDb()
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, id))
    .orderBy(asc(sessionMessages.createdAt))
    .all();
  return Response.json(rows);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const messageId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(sessionMessages)
    .values({
      id: messageId,
      sessionId: id,
      role: parsed.data.role,
      content: parsed.data.content,
      providerId: parsed.data.providerId ?? null,
      modelName: parsed.data.modelName ?? null,
      createdAt: now,
    })
    .run();
  getDb().update(sessions).set({ updatedAt: now }).where(eq(sessions.id, id)).run();
  return Response.json({ id: messageId });
}

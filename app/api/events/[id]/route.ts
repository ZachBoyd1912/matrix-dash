import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(50000).optional(),
  location: z.string().max(500).optional(),
  startsAt: z.string().max(200).optional(),
  endsAt: z.string().max(200).optional(),
  allDay: z.boolean().optional(),
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
  getDb()
    .update(events)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(events.id, id))
    .run();
  return Response.json({ ok: true });
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getDb().delete(events).where(eq(events.id, id)).run();
  return Response.json({ ok: true });
});

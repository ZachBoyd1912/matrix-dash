import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { pipelineItems } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["open", "done", "dropped"]),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const row = getDb().select().from(pipelineItems).where(eq(pipelineItems.id, id)).get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(row);
});

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
    .update(pipelineItems)
    .set({
      status: parsed.data.status,
      // Reopening a row clears resolvedAt; leaving "open" is a no-op here.
      resolvedAt: parsed.data.status === "open" ? null : new Date().toISOString(),
    })
    .where(eq(pipelineItems.id, id))
    .run();

  return Response.json({ ok: true });
});

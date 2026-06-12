import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emailAccounts } from "@/lib/db/schema";
import { syncAccount } from "@/lib/services/email";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  triageEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
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
  getDb().update(emailAccounts).set(parsed.data).where(eq(emailAccounts.id, id)).run();
  return Response.json({ ok: true });
}

export async function POST(_req: Request, ctx: Ctx) {
  // Manual sync trigger.
  const { id } = await ctx.params;
  const account = getDb().select().from(emailAccounts).where(eq(emailAccounts.id, id)).get();
  if (!account) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const count = await syncAccount(account);
    return Response.json({ ok: true, imported: count });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(emailAccounts).where(eq(emailAccounts.id, id)).run();
  return Response.json({ ok: true });
}

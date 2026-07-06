import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import type { Email } from "@/types/email";

export const dynamic = "force-dynamic";

function toEmail(row: typeof emails.$inferSelect): Email {
  return { ...row, isRead: !!row.isRead, isStarred: !!row.isStarred };
}

const updateSchema = z.object({
  folder: z.enum(["inbox", "sent", "drafts", "trash"]).optional(),
  fromAddr: z.string().max(320).optional(),
  toAddr: z.string().max(320).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().max(50000).optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toEmail(row));
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
  getDb().update(emails).set(parsed.data).where(eq(emails.id, id)).run();
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  return Response.json(row ? toEmail(row) : { id });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().delete(emails).where(eq(emails.id, id)).run();
  return Response.json({ ok: true });
}

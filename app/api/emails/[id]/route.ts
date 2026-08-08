import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";
import { toEmailDetail } from "@/lib/services/email-dto";
import { repairEmailHtml } from "@/lib/services/gmail";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  folder: z.enum(["inbox", "sent", "drafts", "trash"]).optional(),
  fromAddr: z.string().max(320).optional(),
  toAddr: z.string().max(320).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().max(50000).optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  // `bodyHtml` is deliberately absent. It is the one field that reaches a
  // raw-HTML render path, so the sync/repair code is its only writer — a
  // client must not be able to PATCH markup into the reading pane.
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  let html = row.bodyHtml;
  // Mail synced before HTML was stored kept ONLY the text/plain alternative,
  // and re-syncing skips messages already present — so the markup can only be
  // recovered by refetching this one message. Done on open, once, then cached.
  if (!html && row.messageId) {
    try {
      html = await repairEmailHtml(id);
    } catch (err) {
      // A dead token or offline Gmail must still show the text body.
      console.error("[emails] HTML repair failed", err);
    }
  }
  return Response.json(toEmailDetail(row, html));
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
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  getDb().update(emails).set(parsed.data).where(eq(emails.id, id)).run();
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  return Response.json(row ? toEmailDetail(row, row.bodyHtml) : { id });
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getDb().delete(emails).where(eq(emails.id, id)).run();
  return Response.json({ ok: true });
});

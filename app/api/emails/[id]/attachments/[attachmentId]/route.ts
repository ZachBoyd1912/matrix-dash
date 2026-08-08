import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";
import { parseAttachments } from "@/lib/services/email-dto";
import { getGmailAttachment } from "@/lib/services/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string; attachmentId: string }>;
}

/**
 * Stream one attachment's bytes.
 *
 * Gmail keeps attachment bodies out of the message payload, so nothing is
 * stored locally — the bytes are fetched on demand and passed straight through.
 *
 * The requested attachmentId is checked against the metadata recorded for THIS
 * message rather than being forwarded to Gmail as given. Without that check the
 * route would happily proxy any attachment id in the account to anyone who
 * could reach it, using the owner's token.
 */
export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { id, attachmentId } = await ctx.params;

  const row = getDb()
    .select({ messageId: emails.messageId, attachments: emails.attachments })
    .from(emails)
    .where(eq(emails.id, id))
    .get();
  if (!row?.messageId) return Response.json({ error: "not found" }, { status: 404 });

  const meta = parseAttachments(row.attachments)?.find((a) => a.attachmentId === attachmentId);
  if (!meta) return Response.json({ error: "not found" }, { status: 404 });

  const bytes = await getGmailAttachment(row.messageId, attachmentId);
  if (!bytes) return Response.json({ error: "attachment unavailable" }, { status: 502 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": meta.mimeType || "application/octet-stream",
      // `attachment` rather than `inline`: a message can carry an HTML or SVG
      // file, and rendering one inline on this origin would hand the sender a
      // script-execution context.
      "content-disposition": `attachment; filename="${meta.filename.replace(/["\\\r\n]/g, "_")}"`,
      "content-length": String(bytes.length),
      "cache-control": "private, max-age=300",
    },
  });
});

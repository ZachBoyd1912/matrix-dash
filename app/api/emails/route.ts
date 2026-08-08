import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import type { Email } from "@/types/email";
import { listEmails } from "@/lib/services/email-list";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  folder: z.enum(["inbox", "sent", "drafts", "trash"]).default("drafts"),
  fromAddr: z.string().max(320).default(""),
  toAddr: z.string().max(320).default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(50000).default(""),
});

/**
 * Every column EXCEPT bodyHtml. A list response covers the whole folder, and
 * an HTML body runs to hundreds of kilobytes — including it would turn a
 * mailbox listing into a multi-hundred-megabyte payload. The reading pane
 * fetches the markup per message from /api/emails/[id].
 */
export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") ?? "inbox";
  const starred = url.searchParams.get("starred") === "1";
  return Response.json(listEmails(starred ? { starred: true } : { folder }));
});

export const POST = withUser(async (req: Request) => {
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
  const id = randomUUID();
  getDb()
    .insert(emails)
    .values({
      id,
      folder: parsed.data.folder,
      fromAddr: parsed.data.fromAddr,
      toAddr: parsed.data.toAddr,
      subject: parsed.data.subject,
      body: parsed.data.body,
      isRead: parsed.data.folder !== "inbox",
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
});

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import type { Email } from "@/types/email";

export const dynamic = "force-dynamic";

function toEmail(row: typeof emails.$inferSelect): Email {
  return { ...row, isRead: !!row.isRead, isStarred: !!row.isStarred };
}

const createSchema = z.object({
  folder: z.enum(["inbox", "sent", "drafts", "trash"]).default("drafts"),
  fromAddr: z.string().max(320).default(""),
  toAddr: z.string().max(320).default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(50000).default(""),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") ?? "inbox";
  const starred = url.searchParams.get("starred") === "1";

  const db = getDb();
  const rows = starred
    ? db
        .select()
        .from(emails)
        .where(eq(emails.isStarred, true))
        .orderBy(desc(emails.createdAt))
        .all()
    : db
        .select()
        .from(emails)
        .where(eq(emails.folder, folder as Email["folder"]))
        .orderBy(desc(emails.createdAt))
        .all();
  return Response.json(rows.map(toEmail));
}

export async function POST(req: Request) {
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
}

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import type { Email } from "@/types/email";
import { toEmailListItem } from "@/lib/services/email-dto";
import { withUser } from "@/lib/auth/with-user";
import { getSetting, setSetting } from "@/lib/db/settings";
import { backfillEmailHtml } from "@/lib/services/gmail";

/** Set once the pre-bodyHtml rows have been repaired; see the GET handler. */
const BACKFILL_SETTING = "emailHtmlBackfilled";
const BACKFILL_CURSOR = "emailHtmlBackfillCursor";
/** Wall-clock slice a single request may spend repairing old mail. */
const BACKFILL_BUDGET_MS = 2_000;

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
const LIST_COLUMNS = {
  id: emails.id,
  folder: emails.folder,
  fromAddr: emails.fromAddr,
  toAddr: emails.toAddr,
  subject: emails.subject,
  body: emails.body,
  attachments: emails.attachments,
  isRead: emails.isRead,
  isStarred: emails.isStarred,
  createdAt: emails.createdAt,
} as const;

export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") ?? "inbox";
  const starred = url.searchParams.get("starred") === "1";

  // One-time repair of mail synced before HTML had its own column, whose
  // `body` therefore holds raw markup — the reason the list preview showed
  // `<!doctype html> <html xmlns=...`. Guarded by a setting so it runs once,
  // and swallowed on failure: a broken backfill must not take the mailbox down.
  if (getSetting(BACKFILL_SETTING) !== "1") {
    try {
      // Batched, and time-boxed to a slice of one request. The mailbox can hold
      // tens of thousands of messages; doing them all in one pass exhausted a
      // 2GB heap when measured against the real 376MB database, and this VM has
      // 955MB. Whatever is left resumes on the next page load, and the cursor
      // persists so no batch is ever re-scanned.
      const deadline = Date.now() + BACKFILL_BUDGET_MS;
      let cursor = getSetting(BACKFILL_CURSOR) ?? "";
      let repaired = 0;
      let done = false;
      while (Date.now() < deadline) {
        const batch = backfillEmailHtml(undefined, cursor);
        repaired += batch.repaired;
        if (batch.scanned === 0) {
          done = true;
          break;
        }
        cursor = batch.lastId;
        setSetting(BACKFILL_CURSOR, cursor);
      }
      if (done) setSetting(BACKFILL_SETTING, "1");
      if (repaired > 0) {
        console.log(
          `[emails] repaired HTML for ${repaired} message(s)${done ? " (complete)" : ""}`
        );
      }
    } catch (err) {
      // A failed repair must never take the mailbox down — the text bodies
      // still render, they just keep looking like markup until this succeeds.
      console.error("[emails] HTML backfill failed", err);
    }
  }

  const db = getDb();
  const rows = starred
    ? db
        .select(LIST_COLUMNS)
        .from(emails)
        .where(eq(emails.isStarred, true))
        .orderBy(desc(emails.createdAt))
        .all()
    : db
        .select(LIST_COLUMNS)
        .from(emails)
        .where(eq(emails.folder, folder as Email["folder"]))
        .orderBy(desc(emails.createdAt))
        .all();
  return Response.json(rows.map(toEmailListItem));
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

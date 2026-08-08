import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import { toEmailListItem } from "./email-dto";
import type { Email, EmailFolder } from "@/types/email";

/**
 * Characters of body text sent per row. The list renders one truncated line,
 * so everything past this is paid for and thrown away.
 */
export const PREVIEW_CHARS = 300;

/**
 * Columns for a folder listing.
 *
 * The truncation happens in SQL, not JavaScript, and that is the whole point.
 * A folder response covers the ENTIRE folder — this mailbox has ~12,000
 * messages in its inbox — and at up to 20,000 characters each, materialising
 * full bodies is roughly 240MB of strings before serialisation even begins.
 * That exhausted the heap on the 955MB production VM and killed the service on
 * the first page load after deploy. `substr` in the query means SQLite never
 * hands those bytes to Node at all.
 *
 * `bodyHtml` is excluded for the same reason, an order of magnitude over.
 */
const LIST_COLUMNS = {
  id: emails.id,
  folder: emails.folder,
  fromAddr: emails.fromAddr,
  toAddr: emails.toAddr,
  subject: emails.subject,
  body: sql<string>`substr(${emails.body}, 1, ${PREVIEW_CHARS})`.as("body"),
  // Presence only — the list draws a paperclip, and the reading pane fetches
  // real metadata per message.
  hasAttachments: sql<number>`CASE WHEN ${emails.attachments} IS NULL THEN 0 ELSE 1 END`.as(
    "has_attachments"
  ),
  isRead: emails.isRead,
  isStarred: emails.isStarred,
  createdAt: emails.createdAt,
} as const;

export function listEmails(query: { folder?: string; starred?: boolean }): Email[] {
  const db = getDb();
  const rows = query.starred
    ? db
        .select(LIST_COLUMNS)
        .from(emails)
        .where(eq(emails.isStarred, true))
        .orderBy(desc(emails.createdAt))
        .all()
    : db
        .select(LIST_COLUMNS)
        .from(emails)
        .where(eq(emails.folder, (query.folder ?? "inbox") as EmailFolder))
        .orderBy(desc(emails.createdAt))
        .all();
  return rows.map((r) => toEmailListItem({ ...r, attachments: null }));
}

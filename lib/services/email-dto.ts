import type { emails } from "@/lib/db/schema";
import type { AttachmentMeta, Email } from "@/types/email";
import { sanitizeEmailHtml } from "@/lib/utils/sanitize";

/**
 * The single row→DTO mapping, shared by the list and detail routes.
 *
 * It exists as one function because the two differ in exactly one dimension —
 * whether the HTML body travels — and duplicating the mapping is how the list
 * route ends up shipping 400KB of markup per message by accident.
 */

/** Columns the LIST endpoint selects: everything except the heavy HTML body. */
export type EmailListRow = Pick<
  typeof emails.$inferSelect,
  | "id"
  | "folder"
  | "fromAddr"
  | "toAddr"
  | "subject"
  | "body"
  | "attachments"
  | "isRead"
  | "isStarred"
  | "createdAt"
>;

/**
 * Attachment metadata is stored as a JSON string. A malformed value must not
 * take a mailbox listing down, so it degrades to "no attachments" rather than
 * throwing — the message itself still reads fine.
 */
export function parseAttachments(raw: string | null): AttachmentMeta[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (a): a is AttachmentMeta =>
        !!a && typeof a.attachmentId === "string" && typeof a.filename === "string"
    );
  } catch {
    return undefined;
  }
}

export function toEmailListItem(row: EmailListRow): Email {
  const attachments = parseAttachments(row.attachments);
  return {
    id: row.id,
    folder: row.folder,
    fromAddr: row.fromAddr,
    toAddr: row.toAddr,
    subject: row.subject,
    body: row.body,
    isRead: !!row.isRead,
    isStarred: !!row.isStarred,
    createdAt: row.createdAt,
    ...(attachments?.length ? { attachments } : {}),
  };
}

/**
 * The full message. `bodyHtml` is sanitized here, at read time rather than at
 * write time, so tightening the allow-list later also protects mail that is
 * already stored.
 */
export function toEmailDetail(row: typeof emails.$inferSelect, bodyHtml?: string | null): Email {
  return {
    ...toEmailListItem(row),
    bodyHtml: bodyHtml ? sanitizeEmailHtml(bodyHtml) : null,
  };
}

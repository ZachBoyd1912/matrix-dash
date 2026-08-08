import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { gmailConnections, emails } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { notify } from "@/lib/services/notify";
import { htmlToText, looksLikeHtml } from "@/lib/utils/sanitize";
import type { AttachmentMeta } from "@/types/email";

/**
 * Storage caps. HTML is an order of magnitude larger than its text
 * alternative — a marketing email is routinely 100KB of table markup — so it
 * gets its own, far larger budget rather than being truncated to the text cap
 * and rendering as a half-finished document.
 */
const MAX_BODY_TEXT = 20_000;
const MAX_BODY_HTML = 400_000;

/**
 * Rows per backfill batch. Small on purpose: this runs inside a request on a
 * 955MB VM, and htmlToText is not cheap.
 */
const BACKFILL_BATCH = 300;

/**
 * The cap the OLD sync applied to every body. A recovered body sitting at this
 * length was cut off mid-document rather than authored that way.
 */
const LEGACY_BODY_CAP = 20_000;

// ─── Helpers ──────────────────────────────────────────

/** Get the active Gmail connection and return a decrypted access token. */
function getGmailToken() {
  const conn = getDb()
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.isActive, true))
    .get();
  if (!conn) throw new Error("No active Gmail connection");
  return { conn, token: decrypt(conn.accessToken) };
}

/** Refresh the access token if expired, updating the DB. */
async function ensureFreshToken(conn: typeof gmailConnections.$inferSelect): Promise<string> {
  if (conn.tokenExpires && new Date(conn.tokenExpires) > new Date()) {
    return decrypt(conn.accessToken);
  }
  const refreshToken = decrypt(conn.refreshToken || "");
  if (!refreshToken) throw new Error("No refresh token available");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || "Token refresh failed");

  const expiresIn = data.expires_in || 3600;
  const tokenExpires = new Date(Date.now() + expiresIn * 1000).toISOString();
  getDb()
    .update(gmailConnections)
    .set({ accessToken: encrypt(data.access_token), tokenExpires })
    .where(eq(gmailConnections.id, conn.id))
    .run();
  return data.access_token;
}

async function gmailApi(path: string, init?: RequestInit) {
  const { conn, token } = getGmailToken();
  let accessToken = token;
  try {
    accessToken = await ensureFreshToken(conn);
  } catch {
    // Use existing token if refresh fails
  }
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

// ─── Sync ─────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: { data?: string };
    mimeType?: string;
  };
  internalDate?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  filename?: string;
  headers?: { name: string; value: string }[];
  parts?: GmailPart[];
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export interface ExtractedBodies {
  /** The HTML alternative, if the message has one. */
  html: string | null;
  /** The text/plain alternative, if the message has one. */
  text: string | null;
}

/**
 * Collect BOTH body representations from a Gmail payload.
 *
 * The previous version returned a single string and preferred text/plain, so
 * every HTML email was stored as its stripped-down text alternative — which is
 * why rich mail rendered as an unstyled wall of words. Worse, a message with
 * no text/plain part fell through to returning raw HTML in the same field,
 * which then rendered as escaped markup and leaked `<!doctype html>` into the
 * message list.
 *
 * It also recursed with `{ parts: part.parts }` and returned the first
 * non-empty result, so a `multipart/related` wrapping a `multipart/alternative`
 * yielded whichever branch it reached first and discarded the sibling. This
 * walks the entire tree and keeps the first of each type it finds, which is
 * the outermost/preferred one in MIME ordering.
 */
export function extractBodies(payload: GmailMessage["payload"]): ExtractedBodies {
  const out: ExtractedBodies = { html: null, text: null };
  if (!payload) return out;

  const visit = (part: GmailPart): void => {
    if (out.html && out.text) return; // both found; nothing deeper can improve it
    // A part with a filename is an attachment, not the body — including inline
    // images in multipart/related, which must not become the message text.
    if (part.filename) return;

    const mime = part.mimeType?.toLowerCase() ?? "";
    if (part.body?.data) {
      if (mime === "text/html" && !out.html) out.html = decodeBase64(part.body.data);
      else if (mime === "text/plain" && !out.text) out.text = decodeBase64(part.body.data);
    }
    for (const child of part.parts ?? []) visit(child);
  };

  visit(payload as GmailPart);

  // A single-part message carries its content on the payload itself with no
  // parts array; classify it by the payload's own mimeType.
  if (!out.html && !out.text && payload.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    if ((payload.mimeType ?? "").toLowerCase() === "text/html") out.html = decoded;
    else out.text = decoded;
  }
  return out;
}

/**
 * Every attachment on a message, as metadata only.
 *
 * Gmail does not include attachment bytes in a message payload — just an
 * `attachmentId` to fetch them by — so nothing here is large. Previously these
 * parts were walked past entirely, which is why the reading pane could not even
 * tell you an email HAD an attachment.
 *
 * Inline images (a logo referenced by `cid:` from the HTML) carry a filename
 * too, and Gmail marks them with a Content-Disposition of `inline`. They are
 * excluded: listing a spacer.gif as an attachment is noise.
 */
export function extractAttachments(payload: GmailMessage["payload"]): AttachmentMeta[] {
  const out: AttachmentMeta[] = [];
  if (!payload) return out;

  const visit = (part: GmailPart): void => {
    const disposition = getHeader(part.headers, "Content-Disposition").toLowerCase();
    const isInline = disposition.startsWith("inline");
    if (part.filename && part.body?.attachmentId && !isInline) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    for (const child of part.parts ?? []) visit(child);
  };
  visit(payload as GmailPart);
  return out;
}

/** Body columns for one message: `body` is always plain text, `bodyHtml` may be null. */
export function bodiesToColumns(extracted: ExtractedBodies): {
  body: string;
  bodyHtml: string | null;
} {
  const html = extracted.html?.trim() || null;
  // Derive readable text when the sender supplied no plain alternative, so the
  // list preview, search and AI summaries never see markup.
  const text = extracted.text?.trim() || (html ? htmlToText(html) : "");
  return {
    body: text.slice(0, MAX_BODY_TEXT),
    bodyHtml: html ? html.slice(0, MAX_BODY_HTML) : null,
  };
}

/** Sync recent emails from Gmail into the local mailbox. */
export async function syncGmailEmails(maxTotal = 100): Promise<number> {
  const db = getDb();
  const { conn } = getGmailToken();
  const now = new Date().toISOString();
  let imported = 0;
  let pageToken: string | undefined;

  while (imported < maxTotal) {
    const perPage = Math.min(maxTotal - imported, 500);
    const params = new URLSearchParams({
      maxResults: String(perPage),
      q: "-label:trash -label:spam",
      includeSpamTrash: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await gmailApi(`/messages?${params}`);
    if (!res.ok) break;
    const data = await res.json();
    const messageIds: { id: string; threadId: string }[] = data.messages ?? [];
    if (!messageIds.length) break;

    for (const { id } of messageIds) {
      const existing = db
        .select({ id: emails.id })
        .from(emails)
        .where(eq(emails.messageId, id))
        .get();
      if (existing) continue;

      const msgRes = await gmailApi(`/messages/${id}?format=full`);
      if (!msgRes.ok) continue;
      const msg: GmailMessage = await msgRes.json();

      const headers = msg.payload?.headers;
      const from = getHeader(headers, "From") || conn.googleEmail;
      const subject = getHeader(headers, "Subject") || "(No subject)";
      const to = getHeader(headers, "To") || conn.googleEmail;
      const { body, bodyHtml } = bodiesToColumns(extractBodies(msg.payload));
      const found = extractAttachments(msg.payload);
      const attachments = found.length ? JSON.stringify(found) : null;
      const labels = msg.labelIds ?? [];
      const isRead = !labels.includes("UNREAD");
      const isStarred = labels.includes("STARRED");
      const isTrash = labels.includes("TRASH") || labels.includes("SPAM");
      const folder = isTrash ? "trash" : labels.includes("SENT") ? "sent" : "inbox";

      db.insert(emails)
        .values({
          id: randomUUID(),
          folder,
          fromAddr: from,
          toAddr: to,
          subject,
          body,
          bodyHtml,
          attachments,
          isRead,
          isStarred,
          messageId: id,
          createdAt: msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() : now,
        })
        .run();
      imported++;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  db.update(gmailConnections).set({ createdAt: now }).where(eq(gmailConnections.id, conn.id)).run();
  if (imported > 0) {
    notify({
      title: "Gmail synced",
      body: `${imported} new email${imported > 1 ? "s" : ""} imported`,
    });
  }
  return imported;
}

// ─── Send ─────────────────────────────────────────────

/** Send an email via Gmail API. */
export async function sendGmailEmail(
  to: string,
  subject: string,
  body: string,
  options?: { cc?: string; bcc?: string; replyTo?: string }
) {
  const { conn } = getGmailToken();
  const raw = [
    `From: ${conn.googleEmail}`,
    `To: ${to}`,
    options?.cc ? `Cc: ${options.cc}` : "",
    options?.bcc ? `Bcc: ${options.bcc}` : "",
    options?.replyTo ? `Reply-To: ${options.replyTo}` : "",
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const encoded = Buffer.from(raw).toString("base64url");

  const res = await gmailApi("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.error?.message || `Send failed: ${res.status}` };
  }
  const data = await res.json();
  const now = new Date().toISOString();

  // Save to local sent folder
  getDb()
    .insert(emails)
    .values({
      id: randomUUID(),
      folder: "sent",
      fromAddr: conn.googleEmail,
      toAddr: to,
      subject,
      body,
      isRead: true,
      messageId: data.id,
      createdAt: now,
    })
    .run();

  return { ok: true, messageId: data.id, threadId: data.threadId };
}

// ─── Read / Search ────────────────────────────────────

/** Get a single email by Gmail message ID. */
export async function getGmailEmail(messageId: string) {
  const res = await gmailApi(`/messages/${messageId}?format=full`);
  if (!res.ok) return null;
  const msg: GmailMessage = await res.json();
  const headers = msg.payload?.headers;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    ...bodiesToColumns(extractBodies(msg.payload)),
    snippet: msg.snippet,
    labels: msg.labelIds ?? [],
    date: msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() : null,
  };
}

/** Search Gmail using Gmail search syntax. */
export async function searchGmailEmails(query: string, limit = 20) {
  const res = await gmailApi(`/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  const messageIds: { id: string }[] = data.messages ?? [];
  if (!messageIds.length) return [];

  const results = await Promise.all(
    messageIds.map(async ({ id }) => {
      const res = await gmailApi(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      );
      if (!res.ok) return null;
      const msg: any = await res.json();
      const headers = msg.payload?.headers;
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        snippet: msg.snippet,
        labels: msg.labelIds ?? [],
        date: msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() : null,
      };
    })
  );

  return results.filter(Boolean);
}

// ─── Modify ───────────────────────────────────────────

/** Add or remove labels on an email (for mark read, star, archive, trash etc.) */
export async function modifyGmailLabel(
  messageId: string,
  addLabels?: string[],
  removeLabels?: string[]
) {
  const res = await gmailApi(`/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: addLabels ?? [],
      removeLabelIds: removeLabels ?? [],
    }),
  });
  if (!res.ok) return { error: `Modify failed: ${res.status}` };
  const data = await res.json();
  return { ok: true, labels: data.labelIds };

  // Also update local DB if synced
  const db = getDb();
  const local = db.select().from(emails).where(eq(emails.messageId, messageId)).get();
  if (!local) return { ok: true, labels: data.labelIds };

  const emailId = local!.id;

  const updates: Partial<typeof emails.$inferInsert> = {};
  if (removeLabels?.includes("UNREAD")) updates.isRead = true;
  if (addLabels?.includes("UNREAD")) updates.isRead = false;
  if (addLabels?.includes("STARRED")) updates.isStarred = true;
  if (removeLabels?.includes("STARRED")) updates.isStarred = false;
  if (addLabels?.includes("TRASH")) updates.folder = "trash";
  if (removeLabels?.includes("TRASH")) updates.folder = "inbox";
  if (Object.keys(updates).length > 0) {
    db.update(emails).set(updates).where(eq(emails.id, emailId!)).run();
  }
}

// ─── Labels ───────────────────────────────────────────

/** List Gmail labels (system + user). */
export async function listGmailLabels() {
  const res = await gmailApi("/labels");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.labels ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    type: l.type, // "system" or "user"
    messagesTotal: l.messagesTotal,
    messagesUnread: l.messagesUnread,
    threadsTotal: l.threadsTotal,
  }));
}

/** Get unread count, total messages, etc. */
export async function getGmailProfile() {
  const res = await gmailApi("/profile");
  if (!res.ok) return null;
  const data = await res.json();
  return {
    emailAddress: data.emailAddress,
    messagesTotal: data.messagesTotal,
    threadsTotal: data.threadsTotal,
    historyId: data.historyId,
  };
}

// ─── Repairing mail stored before HTML was kept ───────────────────────────

/**
 * Move HTML that earlier syncs wrote into the `body` column across to
 * `bodyHtml`, and replace `body` with readable text.
 *
 * Those rows are doubly broken: the reading pane shows escaped markup, and the
 * list preview shows `<!doctype html> <html xmlns=...`. This is a pure local
 * rewrite — no Gmail calls — so it repairs the whole mailbox at once. Runs
 * inside one transaction and reports how many rows it touched.
 *
 * Only rows whose stored body actually looks like markup are touched; a
 * genuine plain-text mail that merely mentions "<p>" is left alone by
 * looksLikeHtml's tag-shaped check.
 */
export function backfillEmailHtml(
  limit = BACKFILL_BATCH,
  afterId = ""
): { scanned: number; repaired: number; lastId: string } {
  const db = getDb();
  // Filtering in SQL, and only the columns needed, is load-bearing rather than
  // tidiness. Selecting every row first was measured on the real 376MB mailbox
  // (34,916 messages): it exhausted a 2GB heap and killed the process. The VM
  // this deploys to has 955MB total, so that would have taken production down.
  //
  // `trim(body) LIKE '<%'` is a coarser test than looksLikeHtml — it misses a
  // body that opens with a comment or stray text — but it is an index-free
  // scan SQLite does without materialising anything, and looksLikeHtml still
  // makes the final call below. Anything it misses simply stays as text.
  //
  // The `id > afterId` cursor guarantees forward progress. Without it a row
  // that matches the SQL filter but fails looksLikeHtml below is never updated
  // and so is re-selected by every batch forever, wedging the caller's loop on
  // the same page of rows.
  const candidates = db
    .select({ id: emails.id, body: emails.body })
    .from(emails)
    .where(
      sql`${emails.bodyHtml} IS NULL AND trim(${emails.body}) LIKE '<%' AND ${emails.id} > ${afterId}`
    )
    .orderBy(emails.id)
    .limit(limit)
    .all();
  if (candidates.length === 0) return { scanned: 0, repaired: 0, lastId: afterId };

  let repaired = 0;
  db.transaction((tx) => {
    for (const row of candidates) {
      if (!looksLikeHtml(row.body)) continue;
      // The old sync truncated every body to 20,000 characters, so a long
      // email's markup was cut off mid-document — often mid-tag. Promoting
      // that to bodyHtml would render a visibly half-finished message. Leave
      // bodyHtml null for those and let repairEmailHtml refetch the complete
      // document from Gmail the first time the message is opened; the preview
      // text below is still fixed either way, which is the visible half of the
      // bug. Detected by length rather than by parsing: a body sitting exactly
      // at the old ceiling was cut, not authored that way.
      const wasTruncated = row.body.length >= LEGACY_BODY_CAP;
      tx.update(emails)
        .set({
          ...(wasTruncated ? {} : { bodyHtml: row.body.slice(0, MAX_BODY_HTML) }),
          body: htmlToText(row.body).slice(0, MAX_BODY_TEXT),
        })
        .where(eq(emails.id, row.id))
        .run();
      repaired++;
    }
  });
  return { scanned: candidates.length, repaired, lastId: candidates[candidates.length - 1].id };
}

/**
 * Fetch the HTML for one already-synced message and store it.
 *
 * Needed because the old sync kept ONLY the text/plain alternative for any
 * message that had one — that HTML was never stored, so no local backfill can
 * recover it. Re-syncing cannot either: syncGmailEmails skips messages whose
 * messageId already exists.
 *
 * So it is done lazily, for the single message being opened, rather than
 * re-fetching tens of thousands. Returns the HTML, or null when there is
 * genuinely none (a real plain-text email) — in which case `repairedAt` is
 * still stamped via an empty-string marker would be wrong, so the caller must
 * tolerate re-asking; a plain-text mail is cheap to re-check and stays correct
 * if the sender's mail is ever re-synced properly.
 */
export async function repairEmailHtml(emailId: string): Promise<string | null> {
  const db = getDb();
  const row = db
    .select({ id: emails.id, messageId: emails.messageId, bodyHtml: emails.bodyHtml })
    .from(emails)
    .where(eq(emails.id, emailId))
    .get();
  if (!row?.messageId || row.bodyHtml) return row?.bodyHtml ?? null;

  const res = await gmailApi(`/messages/${row.messageId}?format=full`);
  if (!res.ok) return null;
  const msg: GmailMessage = await res.json();
  const { body, bodyHtml } = bodiesToColumns(extractBodies(msg.payload));
  const found = extractAttachments(msg.payload);
  // The payload is already in hand, so recover attachment metadata in the same
  // round trip rather than making the user open the message twice.
  if (found.length) {
    db.update(emails)
      .set({ attachments: JSON.stringify(found) })
      .where(eq(emails.id, row.id))
      .run();
  }
  if (!bodyHtml) return null;

  // Refresh the text too: the stored copy came from the same message, but the
  // derived version is consistent with what the new sync path would write.
  db.update(emails)
    .set({ bodyHtml, ...(body ? { body } : {}) })
    .where(eq(emails.id, row.id))
    .run();
  return bodyHtml;
}

/**
 * Fetch one attachment's bytes. Returns null rather than throwing so the route
 * can answer 502 while the rest of the message keeps rendering.
 *
 * The caller is responsible for checking that this attachmentId actually
 * belongs to the message being viewed — this function trusts its arguments.
 */
export async function getGmailAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const res = await gmailApi(`/messages/${messageId}/attachments/${attachmentId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: string };
  if (!data.data) return null;
  return Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { gmailConnections, emails, emailAccounts } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { notify } from "@/lib/services/notify";

// ─── Helpers ──────────────────────────────────────────

/** Get the active Gmail connection and return a decrypted access token. */
function getGmailToken() {
  const conn = getDb()
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.isActive, true))
    .get();
  if (!conn) {
    console.error("[gmail] No active Gmail connection in DB");
    throw new Error("No active Gmail connection");
  }
  console.log("[gmail] using connection:", conn.googleEmail);
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
  body?: { data?: string; attachmentId?: string };
  filename?: string;
  parts?: GmailPart[];
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(payload: GmailMessage["payload"]): string {
  if (!payload) return "";
  // Check for text/plain or text/html parts
  const parts = payload.parts ?? [payload];
  // Prefer plain text, fall back to HTML
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64(part.body.data);
    }
  }
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeBase64(part.body.data);
    }
  }
  // Check nested multipart
  for (const part of parts) {
    if (part.parts) {
      const nested = extractBody({ parts: part.parts } as any);
      if (nested) return nested;
    }
  }
  return payload.body?.data ? decodeBase64(payload.body.data) : "";
}

/** Sync recent emails from Gmail into the local mailbox. */
export async function syncGmailEmails(limit = 50): Promise<number> {
  console.log("[gmail/sync] starting sync, limit:", limit);
  const res = await gmailApi(
    `/messages?maxResults=${limit}&q=-label:trash -label:spam&includeSpamTrash=false`
  );
  console.log("[gmail/sync] API response:", res.status);
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await res.json();
  const messageIds: { id: string; threadId: string }[] = data.messages ?? [];
  console.log("[gmail/sync] found", messageIds.length, "messages");
  if (!messageIds.length) return 0;

  const db = getDb();
  const now = new Date().toISOString();
  let imported = 0;

  // Use the Gmail connection's email as the account address
  const { conn } = getGmailToken();

  for (const { id } of messageIds) {
    // Check if already synced
    const existing = db
      .select({ id: emails.id })
      .from(emails)
      .where(eq(emails.messageId, id))
      .get();
    if (existing) continue;

    // Fetch full message
    const msgRes = await gmailApi(`/messages/${id}?format=full`);
    if (!msgRes.ok) continue;
    const msg: GmailMessage = await msgRes.json();

    const headers = msg.payload?.headers;
    const from = getHeader(headers, "From") || conn.googleEmail;
    const subject = getHeader(headers, "Subject") || "(No subject)";
    const to = getHeader(headers, "To") || conn.googleEmail;
    const body = extractBody(msg.payload).slice(0, 20000);
    const labels = msg.labelIds ?? [];
    const isRead = !labels.includes("UNREAD");
    const isStarred = labels.includes("STARRED");
    const isTrash = labels.includes("TRASH") || labels.includes("SPAM");
    const folder = isTrash ? "trash" : (labels.includes("SENT") ? "sent" : "inbox");

    db.insert(emails)
      .values({
        id: randomUUID(),
        folder,
        fromAddr: from,
        toAddr: to,
        subject,
        body,
        isRead,
        isStarred,
        messageId: id,
        createdAt: msg.internalDate
          ? new Date(parseInt(msg.internalDate)).toISOString()
          : now,
      })
      .run();
    imported++;
  }

  // Update last sync
  db.update(gmailConnections)
    .set({ createdAt: now })
    .where(eq(gmailConnections.id, conn.id))
    .run();

  if (imported > 0) {
    notify({ title: "Gmail synced", body: `${imported} new email${imported > 1 ? "s" : ""} imported` });
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
    body: extractBody(msg.payload),
    snippet: msg.snippet,
    labels: msg.labelIds ?? [],
    date: msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() : null,
  };
}

/** Search Gmail using Gmail search syntax. */
export async function searchGmailEmails(query: string, limit = 20) {
  const res = await gmailApi(
    `/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const messageIds: { id: string }[] = data.messages ?? [];
  if (!messageIds.length) return [];

  const results = await Promise.all(
    messageIds.map(async ({ id }) => {
      const res = await gmailApi(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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

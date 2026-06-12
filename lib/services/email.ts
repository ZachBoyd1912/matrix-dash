import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { emailAccounts, emails } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";
import { getActiveProvider, resolveModel } from "@/lib/ai/registry";
import { generateText } from "ai";
import { notify } from "./notify";

type Account = typeof emailAccounts.$inferSelect;

export async function testEmailAccount(account: {
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
  useTls: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.useTls,
    auth: { user: account.username, pass: account.password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Pull the most recent messages from an account's INBOX into the local DB. */
export async function syncAccount(account: Account, limit = 25): Promise<number> {
  const password = decrypt(account.passwordEncrypted);
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: !!account.useTls,
    auth: { user: account.username, pass: password },
    logger: false,
  });

  let imported = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox || typeof mailbox === "boolean") return 0;
      const total = mailbox.exists;
      if (total === 0) return 0;
      const start = Math.max(1, total - limit + 1);
      const db = getDb();

      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true })) {
        const messageId = msg.envelope?.messageId ?? `uid-${msg.uid}`;
        const exists = getSqlite()
          .prepare("SELECT 1 FROM emails WHERE message_id = ? LIMIT 1")
          .get(messageId);
        if (exists) continue;
        if (!msg.source) continue;

        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddr = parsed.from?.text ?? msg.envelope?.from?.[0]?.address ?? "";
        const subject = parsed.subject ?? msg.envelope?.subject ?? "(no subject)";
        const body = (parsed.text ?? "").slice(0, 20000);
        const id = randomUUID();

        db.insert(emails)
          .values({
            id,
            folder: "inbox",
            fromAddr,
            toAddr: account.address,
            subject,
            body,
            isRead: false,
            accountId: account.id,
            messageId,
            createdAt: (parsed.date ?? new Date()).toISOString(),
          })
          .run();
        imported++;

        if (account.triageEnabled) {
          void triageEmail(id, fromAddr, subject, body).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  getDb()
    .update(emailAccounts)
    .set({ lastSyncAt: new Date().toISOString() })
    .where(eq(emailAccounts.id, account.id))
    .run();

  if (imported > 0) {
    await notify({
      title: `${imported} new email${imported === 1 ? "" : "s"}`,
      body: account.address,
      kind: "info",
      href: "/dashboard/email",
    });
  }
  return imported;
}

/** AI triage: classify, tag, and summarize one message; draft urgent reply. */
async function triageEmail(emailId: string, from: string, subject: string, body: string) {
  const provider = getActiveProvider();
  if (!provider) return;
  const model = resolveModel(provider);

  const { text } = await generateText({
    model,
    prompt: `Classify this email. Return ONLY JSON:
{"category":"urgent|normal|newsletter|spam","tags":["kw"],"summary":"one sentence"}

From: ${from}
Subject: ${subject}
Body: ${body.slice(0, 2000)}`,
  });

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return;
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      category?: string;
      tags?: string[];
      summary?: string;
    };
    const tags = [parsed.category, ...(parsed.tags ?? [])].filter(Boolean).join(",");
    getDb()
      .update(emails)
      .set({ tags, summary: parsed.summary ?? null })
      .where(eq(emails.id, emailId))
      .run();

    if (parsed.category === "urgent") {
      await notify({
        title: "Urgent email",
        body: `${subject} — ${parsed.summary ?? ""}`,
        kind: "warning",
        href: "/dashboard/email",
      });
    }
  } catch {
    /* ignore parse errors */
  }
}

/** Send a message via the account's SMTP. */
export async function sendEmail(
  account: Account,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const password = decrypt(account.passwordEncrypted);
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.username, pass: password },
  });
  await transport.sendMail({ from: account.address, to, subject, text: body });

  // Record in Sent.
  getDb()
    .insert(emails)
    .values({
      id: randomUUID(),
      folder: "sent",
      fromAddr: account.address,
      toAddr: to,
      subject,
      body,
      isRead: true,
      accountId: account.id,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/** Sync all active accounts (called by the daemon poller). */
export async function syncAllAccounts(): Promise<void> {
  let accounts: Account[] = [];
  try {
    accounts = getDb().select().from(emailAccounts).where(eq(emailAccounts.isActive, true)).all();
  } catch {
    return;
  }
  for (const account of accounts) {
    try {
      await syncAccount(account);
    } catch (err) {
      console.error(`[email] sync failed for ${account.address}:`, err);
    }
  }
}

import { randomUUID } from "crypto";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emailAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { testEmailAccount } from "@/lib/services/email";
import type { EmailAccountPublic } from "@/types/jarvis";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toPublic(row: typeof emailAccounts.$inferSelect): EmailAccountPublic {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    username: row.username,
    useTls: row.useTls,
    triageEnabled: row.triageEnabled,
    isActive: row.isActive,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
  };
}

const createSchema = z.object({
  label: z.string().min(1).max(500),
  address: z.string().email().max(320),
  imapHost: z.string().min(1).max(200),
  imapPort: z.number().int().default(993),
  smtpHost: z.string().min(1).max(200),
  smtpPort: z.number().int().default(465),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  useTls: z.boolean().optional(),
  triageEnabled: z.boolean().optional(),
  test: z.boolean().optional(),
});

export const GET = withUser(async () => {
  const rows = getDb().select().from(emailAccounts).orderBy(desc(emailAccounts.createdAt)).all();
  return Response.json(rows.map(toPublic));
});

export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Optional connectivity test before saving.
  if (d.test) {
    const result = await testEmailAccount({
      imapHost: d.imapHost,
      imapPort: d.imapPort,
      username: d.username,
      password: d.password,
      useTls: d.useTls ?? true,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  }

  const id = randomUUID();
  getDb()
    .insert(emailAccounts)
    .values({
      id,
      label: d.label,
      address: d.address,
      imapHost: d.imapHost,
      imapPort: d.imapPort,
      smtpHost: d.smtpHost,
      smtpPort: d.smtpPort,
      username: d.username,
      passwordEncrypted: encrypt(d.password),
      useTls: d.useTls ?? true,
      triageEnabled: d.triageEnabled ?? false,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
});

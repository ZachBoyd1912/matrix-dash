import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { emailAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/services/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  accountId: z.string().optional(),
  to: z.string().min(1),
  subject: z.string().default(""),
  body: z.string().default(""),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const account = parsed.data.accountId
    ? getDb().select().from(emailAccounts).where(eq(emailAccounts.id, parsed.data.accountId)).get()
    : getDb().select().from(emailAccounts).where(eq(emailAccounts.isActive, true)).get();

  if (!account) {
    return Response.json({ error: "No email account connected. Add one in Settings → Email." }, { status: 404 });
  }

  try {
    await sendEmail(account, parsed.data.to, parsed.data.subject, parsed.data.body);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

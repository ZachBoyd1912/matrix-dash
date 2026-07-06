import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { vault } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().min(1).max(500),
  value: z.string().min(1).max(50000),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reveal = url.searchParams.get("reveal");
  if (reveal) {
    const row = getDb().select().from(vault).where(eq(vault.id, reveal)).get();
    if (!row) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ id: row.id, label: row.label, value: decrypt(row.valueEncrypted) });
  }
  const rows = getDb().select().from(vault).orderBy(desc(vault.createdAt)).all();
  return Response.json(rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt })));
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const id = randomUUID();
  getDb()
    .insert(vault)
    .values({
      id,
      label: parsed.data.label,
      valueEncrypted: encrypt(parsed.data.value),
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(vault).where(eq(vault.id, id)).run();
  return Response.json({ ok: true });
}

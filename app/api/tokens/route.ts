import { randomUUID, randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({ label: z.string().min(1) });

export async function GET() {
  // Only show last 8 chars to avoid leaking full tokens after creation.
  const rows = getDb().select().from(apiTokens).orderBy(desc(apiTokens.createdAt)).all();
  return Response.json(
    rows.map((r) => ({ ...r, token: `…${r.token.slice(-8)}` }))
  );
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
  const token = `mdx_${randomBytes(24).toString("hex")}`;
  getDb()
    .insert(apiTokens)
    .values({ id, label: parsed.data.label, token, createdAt: new Date().toISOString() })
    .run();
  // Only time the full token is returned.
  return Response.json({ id, token });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(apiTokens).where(eq(apiTokens.id, id)).run();
  return Response.json({ ok: true });
}

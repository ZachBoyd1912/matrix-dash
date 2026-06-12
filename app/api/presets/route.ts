import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { presets } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().default(""),
});

export async function GET() {
  return Response.json(getDb().select().from(presets).orderBy(asc(presets.name)).all());
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
    .insert(presets)
    .values({
      id,
      name: parsed.data.name,
      systemPrompt: parsed.data.systemPrompt,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(presets).where(eq(presets.id, id)).run();
  return Response.json({ ok: true });
}

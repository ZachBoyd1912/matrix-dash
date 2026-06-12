import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memoryLinks } from "@/lib/db/schema";
import { linkMemories } from "@/lib/ai/consolidation";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  sourceMemoryId: z.string().min(1),
  targetMemoryId: z.string().min(1),
  strength: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = linkMemories(
    parsed.data.sourceMemoryId,
    parsed.data.targetMemoryId,
    parsed.data.strength ?? 0.7
  );
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(memoryLinks).where(eq(memoryLinks.id, id)).run();
  return Response.json({ ok: true });
}

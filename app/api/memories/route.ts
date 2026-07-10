import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { searchMemoriesFts } from "@/lib/db/fts";
import { autoLink } from "@/lib/ai/extraction";
import { syncMemoryToVault } from "@/lib/services/obsidian-sync";
import { MEMORY_TYPES, type Memory } from "@/types/memory";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toMemory(row: typeof memories.$inferSelect): Memory {
  return { ...row, isPinned: !!row.isPinned };
}

const createSchema = z.object({
  content: z.string().min(1).max(50000),
  type: z.enum(MEMORY_TYPES as [string, ...string[]]),
  tags: z.union([z.string().max(200), z.array(z.string().max(200))]).optional(),
  importance: z.number().min(0).max(1).optional(),
  isPinned: z.boolean().optional(),
  source: z.string().max(200).optional(),
});

export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const type = url.searchParams.get("type");
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10));

  const db = getDb();

  if (q) {
    const fts = searchMemoriesFts(q, limit);
    const filtered = type ? fts.filter((m) => m.type === type) : fts;
    return Response.json(filtered);
  }

  const rows = type
    ? db
        .select()
        .from(memories)
        .where(eq(memories.type, type as Memory["type"]))
        .orderBy(desc(memories.isPinned), desc(memories.importance), desc(memories.createdAt))
        .limit(limit)
        .all()
    : db
        .select()
        .from(memories)
        .orderBy(desc(memories.isPinned), desc(memories.importance), desc(memories.createdAt))
        .limit(limit)
        .all();

  return Response.json(rows.map(toMemory));
});

export const POST = withUser(async (req: Request) => {
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
  const data = parsed.data;
  const id = randomUUID();
  const tags = Array.isArray(data.tags) ? data.tags.join(",") : (data.tags ?? "");

  getDb()
    .insert(memories)
    .values({
      id,
      content: data.content.trim(),
      type: data.type as Memory["type"],
      tags,
      importance: data.importance ?? 0.5,
      isPinned: data.isPinned ?? false,
      source: data.source ?? "manual",
      createdAt: new Date().toISOString(),
    })
    .run();

  autoLink(id, data.content);

  let created = getDb().select().from(memories).where(eq(memories.id, id)).get();

  if (created && created.content.trim()) {
    try {
      syncMemoryToVault(created);
      created = getDb().select().from(memories).where(eq(memories.id, id)).get() ?? created;
    } catch (err) {
      console.error("[memories] syncMemoryToVault failed:", err);
    }
  }

  return Response.json(created ? toMemory(created) : { id });
});

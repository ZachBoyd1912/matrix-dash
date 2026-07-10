import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSqlite } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { syncMemoryToVault, MEMORIES_SUBDIR } from "@/lib/services/obsidian-sync";
import { getSetting } from "@/lib/db/settings";
import { MEMORY_TYPES, type Memory, type LinkedMemory } from "@/types/memory";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toMemory(row: typeof memories.$inferSelect): Memory {
  return { ...row, isPinned: !!row.isPinned };
}

const updateSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  type: z.enum(MEMORY_TYPES as [string, ...string[]]).optional(),
  tags: z.union([z.string().max(200), z.array(z.string().max(200))]).optional(),
  importance: z.number().min(0).max(1).optional(),
  isPinned: z.boolean().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.select().from(memories).where(eq(memories.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const outgoing = getSqlite()
    .prepare(
      `SELECT ml.id AS linkId, ml.strength AS strength,
              m.id AS id, m.content AS content, m.type AS type
       FROM memory_links ml JOIN memories m ON ml.target_memory_id = m.id
       WHERE ml.source_memory_id = ?`
    )
    .all(id) as Array<{
    linkId: string;
    strength: number;
    id: string;
    content: string;
    type: Memory["type"];
  }>;

  const incoming = getSqlite()
    .prepare(
      `SELECT ml.id AS linkId, ml.strength AS strength,
              m.id AS id, m.content AS content, m.type AS type
       FROM memory_links ml JOIN memories m ON ml.source_memory_id = m.id
       WHERE ml.target_memory_id = ?`
    )
    .all(id) as Array<{
    linkId: string;
    strength: number;
    id: string;
    content: string;
    type: Memory["type"];
  }>;

  const links: LinkedMemory[] = [
    ...outgoing.map((l) => ({
      linkId: l.linkId,
      direction: "outgoing" as const,
      strength: l.strength,
      memory: { id: l.id, content: l.content, type: l.type },
    })),
    ...incoming.map((l) => ({
      linkId: l.linkId,
      direction: "incoming" as const,
      strength: l.strength,
      memory: { id: l.id, content: l.content, type: l.type },
    })),
  ];

  return Response.json({ memory: toMemory(row), links });
});

export const PATCH = withUser(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const updates: Partial<typeof memories.$inferInsert> = {};
  if (data.content !== undefined) updates.content = data.content.trim();
  if (data.type !== undefined) updates.type = data.type as Memory["type"];
  if (data.tags !== undefined)
    updates.tags = Array.isArray(data.tags) ? data.tags.join(",") : data.tags;
  if (data.importance !== undefined) updates.importance = data.importance;
  if (data.isPinned !== undefined) updates.isPinned = data.isPinned;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  getDb().update(memories).set(updates).where(eq(memories.id, id)).run();
  let row = getDb().select().from(memories).where(eq(memories.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  if (row.content.trim()) {
    try {
      syncMemoryToVault(row);
      row = getDb().select().from(memories).where(eq(memories.id, id)).get() ?? row;
    } catch (err) {
      console.error("[memories] syncMemoryToVault failed:", err);
    }
  }

  return Response.json(toMemory(row));
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const existing = getDb().select().from(memories).where(eq(memories.id, id)).get();
  getDb().delete(memories).where(eq(memories.id, id)).run();

  if (existing?.vaultRelPath) {
    try {
      const vaultPath = getSetting("obsidianVaultPath");
      if (vaultPath) {
        fs.rmSync(path.join(vaultPath, MEMORIES_SUBDIR, existing.vaultRelPath), { force: true });
      }
    } catch (err) {
      console.error("[memories] failed to delete vault file:", err);
    }
  }

  return Response.json({ ok: true });
});

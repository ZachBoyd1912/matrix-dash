import { getDb } from "@/lib/db/client";
import { memories, memoryLinks } from "@/lib/db/schema";
import type { Memory } from "@/types/memory";

export const dynamic = "force-dynamic";

function toMemory(row: typeof memories.$inferSelect): Memory {
  return { ...row, isPinned: !!row.isPinned };
}

export async function GET() {
  const db = getDb();
  const allMemories = db.select().from(memories).all().map(toMemory);
  const allLinks = db.select().from(memoryLinks).all();
  return Response.json({
    nodes: allMemories.map((m) => ({
      id: m.id,
      label: m.content.slice(0, 60),
      type: m.type,
      importance: m.importance,
      usageCount: m.usageCount,
      isPinned: m.isPinned,
    })),
    links: allLinks.map((l) => ({
      id: l.id,
      source: l.sourceMemoryId,
      target: l.targetMemoryId,
      strength: l.strength,
    })),
  });
}

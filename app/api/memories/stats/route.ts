import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memories, memoryLinks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const total =
    db
      .select({ c: sql<number>`count(*)` })
      .from(memories)
      .get()?.c ?? 0;
  const links =
    db
      .select({ c: sql<number>`count(*)` })
      .from(memoryLinks)
      .get()?.c ?? 0;
  const byType = db
    .select({ type: memories.type, c: sql<number>`count(*)` })
    .from(memories)
    .groupBy(memories.type)
    .all();
  const pinned =
    db
      .select({ c: sql<number>`count(*)` })
      .from(memories)
      .where(sql`is_pinned = 1`)
      .get()?.c ?? 0;
  const counts: Record<string, number> = { identity: 0, project: 0, global: 0, lesson: 0 };
  for (const row of byType) counts[row.type] = row.c;
  return Response.json({ total, links, pinned, counts });
}

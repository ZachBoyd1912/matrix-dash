import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { memories, memoryLinks } from "@/lib/db/schema";
import { searchMemoriesFts } from "@/lib/db/fts";

/**
 * Tidy: find near-duplicate memories and merge them.
 * Strategy: for every memory, run an FTS search for its content; if the top
 * match has rank stronger than threshold, merge the weaker into the stronger.
 */
export function tidyMemories(): { merged: number; deleted: number } {
  const db = getDb();
  const all = db.select().from(memories).all();
  const removed = new Set<string>();
  let merged = 0;

  for (const m of all) {
    if (removed.has(m.id)) continue;
    const candidates = searchMemoriesFts(m.content, 3).filter(
      (c) => c.id !== m.id && !removed.has(c.id)
    );
    if (candidates.length === 0) continue;
    const top = candidates[0];
    // Stricter than auto-link: only merge very close matches.
    if (Math.abs(top.rank) < 8) continue;

    // Keep whichever has higher (importance × usageCount + 1) score.
    const score = (mem: { importance: number; usageCount: number }) =>
      mem.importance * (mem.usageCount + 1);
    const keep = score(m) >= score(top) ? m : top;
    const drop = keep.id === m.id ? top : m;

    db.update(memories)
      .set({
        usageCount: sql`${memories.usageCount} + ${drop.usageCount}`,
        importance: Math.min(1, keep.importance + drop.importance * 0.1),
        isPinned: keep.isPinned || drop.isPinned,
      })
      .where(eq(memories.id, keep.id))
      .run();

    // Re-point all of drop's links to keep, dedupe.
    db.update(memoryLinks)
      .set({ sourceMemoryId: keep.id })
      .where(eq(memoryLinks.sourceMemoryId, drop.id))
      .run();
    db.update(memoryLinks)
      .set({ targetMemoryId: keep.id })
      .where(eq(memoryLinks.targetMemoryId, drop.id))
      .run();

    db.delete(memories).where(eq(memories.id, drop.id)).run();
    removed.add(drop.id);
    merged++;
  }

  // Clean up self-links created by the re-point step.
  getSqlite()
    .prepare(`DELETE FROM memory_links WHERE source_memory_id = target_memory_id`)
    .run();

  return { merged, deleted: removed.size };
}

/**
 * Decay: every memory loses a small amount of importance per call.
 * Pinned memories are exempt; high-usage memories decay slower.
 */
export function decayMemories(): { adjusted: number; pruned: number } {
  const db = getDb();
  const all = db.select().from(memories).all();
  let adjusted = 0;
  let pruned = 0;

  for (const m of all) {
    if (m.isPinned) continue;
    const usageDamper = 1 / (1 + Math.log1p(m.usageCount));
    const decayed = m.importance * (1 - 0.01 * usageDamper);
    if (decayed < 0.1) {
      db.delete(memories).where(eq(memories.id, m.id)).run();
      pruned++;
    } else {
      db.update(memories).set({ importance: decayed }).where(eq(memories.id, m.id)).run();
      adjusted++;
    }
  }
  return { adjusted, pruned };
}

/** Manually link two memories (idempotent-ish — duplicate links allowed but rare). */
export function linkMemories(sourceId: string, targetId: string, strength = 0.7) {
  if (sourceId === targetId) return null;
  const id = randomUUID();
  getDb()
    .insert(memoryLinks)
    .values({
      id,
      sourceMemoryId: sourceId,
      targetMemoryId: targetId,
      strength,
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { searchMemoriesFts } from "@/lib/db/fts";
import { getAppSettings } from "@/lib/db/settings";
import type { Memory } from "@/types/memory";

function rowToMemory(row: typeof memories.$inferSelect): Memory {
  return { ...row, isPinned: !!row.isPinned };
}

/**
 * Build the "[Autonomous Memory Context]" block to inject in front of the
 * user's message. Returns "" when nothing is worth injecting.
 *
 * Updates usage_count and last_used_at for each injected memory so the
 * decay engine knows what's actually being pulled on.
 */
export function buildMemoryContext(userMessage: string): string {
  const settings = getAppSettings();
  if (!settings.autoInject) return "";

  const limit = settings.maxInjectedMemories;
  const db = getDb();

  // Always inject pinned memories first.
  const pinned = db
    .select()
    .from(memories)
    .where(eq(memories.isPinned, true))
    .all()
    .map(rowToMemory);

  // FTS5 results that match the user message.
  const fts = searchMemoriesFts(userMessage, limit * 2);

  const seen = new Set<string>();
  const merged: Memory[] = [];
  for (const m of [...pinned, ...fts]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
    if (merged.length >= limit) break;
  }

  if (merged.length === 0) return "";

  // Deduplicate by type only when over budget — prefer diverse coverage.
  const byType = new Map<string, Memory[]>();
  for (const m of merged) {
    const arr = byType.get(m.type) ?? [];
    arr.push(m);
    byType.set(m.type, arr);
  }
  const balanced: Memory[] = [];
  let i = 0;
  const buckets = [...byType.values()];
  while (balanced.length < limit) {
    let pushed = false;
    for (const bucket of buckets) {
      if (bucket[i]) {
        balanced.push(bucket[i]);
        pushed = true;
        if (balanced.length >= limit) break;
      }
    }
    if (!pushed) break;
    i++;
  }

  const lines = balanced.map(
    (m) => `- ${m.content} (${m.type}, used ${m.usageCount}×)`
  );
  const context =
    "[Autonomous Memory Context]\n" +
    "The following memories are relevant to this conversation:\n" +
    lines.join("\n") +
    "\n[/Autonomous Memory Context]";

  // Best-effort usage tracking — never let this fail the chat call.
  try {
    const now = new Date().toISOString();
    const stmt = db
      .update(memories)
      .set({
        usageCount: sql`${memories.usageCount} + 1`,
        lastUsedAt: now,
      })
      .where(eq(memories.id, sql.placeholder("id")))
      .prepare();
    for (const m of balanced) stmt.run({ id: m.id });
  } catch {
    /* ignore usage-tracking errors */
  }

  return context;
}

import { getSqlite } from "./client";
import type { Memory } from "@/types/memory";
import type { Note } from "@/types/note";

/** Sanitize free text into a safe FTS5 OR-query of quoted terms. */
export function toFtsQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const unique = [...new Set(words)].slice(0, 12);
  // Quoted prefix terms: matches "glass" against "glassmorphism" too.
  return unique.map((w) => `"${w}"*`).join(" OR ");
}

const MEMORY_COLS = `m.id, m.content, m.type, m.tags, m.importance,
  m.usage_count AS usageCount, m.source, m.embedding,
  m.is_pinned AS isPinned, m.created_at AS createdAt, m.last_used_at AS lastUsedAt`;

type RawMemory = Omit<Memory, "isPinned"> & { isPinned: number | null; rank?: number };

export function searchMemoriesFts(query: string, limit = 10): (Memory & { rank: number })[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT ${MEMORY_COLS}, f.rank AS rank
         FROM memories_fts f JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ? ORDER BY f.rank LIMIT ?`
      )
      .all(fts, limit) as RawMemory[];
    return rows.map((r) => ({ ...r, isPinned: !!r.isPinned, rank: r.rank ?? 0 }));
  } catch {
    return [];
  }
}

const NOTE_COLS = `n.id, n.title, n.content, n.tags, n.folder_id AS folderId,
  n.is_favorite AS isFavorite, n.created_at AS createdAt, n.updated_at AS updatedAt`;

type RawNote = Omit<Note, "isFavorite"> & { isFavorite: number | null };

export function searchNotesFts(query: string, limit = 10): Note[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT ${NOTE_COLS}
         FROM notes_fts f JOIN notes n ON n.rowid = f.rowid
         WHERE notes_fts MATCH ? ORDER BY f.rank LIMIT ?`
      )
      .all(fts, limit) as RawNote[];
    return rows.map((r) => ({ ...r, isFavorite: !!r.isFavorite }));
  } catch {
    return [];
  }
}

export interface SkillHit {
  id: string;
  name: string;
  description: string;
  instructions: string;
  rank: number;
}

/**
 * Retrieve the *enabled* skills whose name/description/instructions match the
 * query, ranked by FTS5 relevance. This is the retrieval half of skill RAG:
 * it lets us inject only the skills relevant to a turn rather than the whole
 * enabled catalog.
 */
export function searchSkillsFts(query: string, limit = 8): SkillHit[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT s.id, s.name, s.description, s.instructions, f.rank AS rank
         FROM skills_fts f JOIN skills s ON s.rowid = f.rowid
         WHERE skills_fts MATCH ? AND s.is_enabled = 1
         ORDER BY f.rank LIMIT ?`
      )
      .all(fts, limit) as SkillHit[];
    return rows;
  } catch {
    return [];
  }
}

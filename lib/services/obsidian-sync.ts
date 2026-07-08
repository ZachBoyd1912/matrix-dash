import crypto, { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq, isNull } from "drizzle-orm";
import { watch, type FSWatcher } from "chokidar";
import { getDb } from "@/lib/db/client";
import { notes, memories } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";

export const NOTES_SUBDIR = "Matrix Notes";
export const MEMORIES_SUBDIR = "Memory Bank";
const MEMORY_TYPES = ["identity", "project", "global", "lesson"] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

// Hashes of the content this module last wrote to a given absolute file path.
// syncNoteFromVault/syncMemoryFromVault compare an incoming file's hash against
// this before touching the DB — if it matches, the change is our own write
// echoing back through the watcher, not a real edit, so we skip it. This is
// what keeps toVault -> watcher -> fromVault from looping forever.
const writeHashes = new Map<string, string>();

export function sanitizeFilename(title: string): string {
  let name = title.replace(/[:/\\*?"<>|]/g, "");
  name = name.trim().replace(/\s+/g, " ");
  name = name.slice(0, 200).trim();
  if (!name) name = "Untitled";
  return `${name}.md`;
}

export function buildFrontmatter(
  fields: Record<string, string | number | boolean | string[]>
): string {
  const keys = Object.keys(fields);
  if (keys.length === 0) return "";
  const lines = keys.map((key) => {
    const value = fields[key];
    if (Array.isArray(value)) return `${key}: [${value.join(", ")}]`;
    return `${key}: ${value}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n`;
}

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!raw.startsWith("---\n")) return { frontmatter: {}, body: raw };
  const closeIdx = raw.indexOf("\n---\n", 4);
  if (closeIdx === -1) return { frontmatter: {}, body: raw };

  const block = raw.slice(4, closeIdx);
  const rest = raw.slice(closeIdx + 5);
  const body = rest.startsWith("\n") ? rest.slice(1) : rest;

  const frontmatter: Record<string, string> = {};
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function parseArrayField(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed ? [trimmed] : [];
}

export function syncNoteToVault(note: typeof notes.$inferSelect): void {
  if (getSetting("obsidianSyncEnabled") !== "1") return;
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return;

  const dir = path.join(vaultPath, NOTES_SUBDIR);
  let filename = sanitizeFilename(note.title || note.id);
  // Two notes can share a title → same sanitized filename; without this the
  // second silently overwrites the first note's vault file. Suffix with a bit
  // of the id when a DIFFERENT row already owns that path.
  const conflict = getDb().select().from(notes).where(eq(notes.vaultRelPath, filename)).get();
  if (conflict && conflict.id !== note.id) {
    filename = filename.replace(/\.md$/, ` (${note.id.slice(0, 4)}).md`);
  }

  if (note.vaultRelPath && note.vaultRelPath !== filename) {
    fs.rmSync(path.join(dir, note.vaultRelPath), { force: true });
  }

  const tags = note.tags
    ? note.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const favorite = !!note.isFavorite;
  // Always emit frontmatter: if it were omitted, a note whose CONTENT starts
  // with "---" (a markdown horizontal rule) would have its opening lines eaten
  // as fake frontmatter on read-back — silent content loss on round-trip.
  const frontmatter = buildFrontmatter({ tags, favorite });
  const content = frontmatter + note.content;

  const targetPath = path.join(dir, filename);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  writeHashes.set(path.resolve(targetPath), sha256(content));

  const now = new Date().toISOString();
  getDb()
    .update(notes)
    .set({ vaultRelPath: filename, vaultSyncedAt: now })
    .where(eq(notes.id, note.id))
    .run();
}

export function syncMemoryToVault(memory: typeof memories.$inferSelect): void {
  if (getSetting("obsidianSyncEnabled") !== "1") return;
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return;

  const dir = path.join(vaultPath, MEMORIES_SUBDIR);
  let filename = sanitizeFilename(memory.content.slice(0, 60) || memory.id);
  // Same collision guard as notes: first 60 chars of two memories can match.
  const conflict = getDb().select().from(memories).where(eq(memories.vaultRelPath, filename)).get();
  if (conflict && conflict.id !== memory.id) {
    filename = filename.replace(/\.md$/, ` (${memory.id.slice(0, 4)}).md`);
  }

  if (memory.vaultRelPath && memory.vaultRelPath !== filename) {
    fs.rmSync(path.join(dir, memory.vaultRelPath), { force: true });
  }

  const tags = memory.tags
    ? memory.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const frontmatter = buildFrontmatter({
    type: memory.type,
    importance: memory.importance,
    usageCount: memory.usageCount,
    pinned: !!memory.isPinned,
    tags,
  });
  const content = frontmatter + memory.content;

  const targetPath = path.join(dir, filename);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  writeHashes.set(path.resolve(targetPath), sha256(content));

  const now = new Date().toISOString();
  getDb()
    .update(memories)
    .set({ vaultRelPath: filename, vaultSyncedAt: now })
    .where(eq(memories.id, memory.id))
    .run();
}

export function syncNoteFromVault(absFilePath: string): void {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return;

  const resolved = path.resolve(absFilePath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch {
    return;
  }
  if (writeHashes.get(resolved) === sha256(raw)) return;

  const dir = path.join(vaultPath, NOTES_SUBDIR);
  const relPath = path.relative(dir, resolved);
  const { frontmatter, body } = parseFrontmatter(raw);
  const tags = frontmatter.tags ? parseArrayField(frontmatter.tags).join(",") : "";
  const favorite = frontmatter.favorite === "true";
  const now = new Date().toISOString();

  const existing = getDb().select().from(notes).where(eq(notes.vaultRelPath, relPath)).get();
  if (existing) {
    const changes: Partial<typeof notes.$inferInsert> = {};
    if (existing.content !== body) changes.content = body;
    if (existing.tags !== tags) changes.tags = tags;
    if (!!existing.isFavorite !== favorite) changes.isFavorite = favorite;
    if (Object.keys(changes).length === 0) {
      getDb().update(notes).set({ vaultSyncedAt: now }).where(eq(notes.id, existing.id)).run();
      return;
    }
    changes.vaultSyncedAt = now;
    changes.updatedAt = now;
    getDb().update(notes).set(changes).where(eq(notes.id, existing.id)).run();
    return;
  }

  getDb()
    .insert(notes)
    .values({
      id: randomUUID(),
      title: path.basename(resolved, ".md"),
      content: body,
      tags,
      isFavorite: favorite,
      vaultRelPath: relPath,
      vaultSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function syncMemoryFromVault(absFilePath: string): void {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return;

  const resolved = path.resolve(absFilePath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch {
    return;
  }
  if (writeHashes.get(resolved) === sha256(raw)) return;

  const dir = path.join(vaultPath, MEMORIES_SUBDIR);
  const relPath = path.relative(dir, resolved);
  const { frontmatter, body } = parseFrontmatter(raw);

  const type: MemoryType = MEMORY_TYPES.includes(frontmatter.type as MemoryType)
    ? (frontmatter.type as MemoryType)
    : "global";
  const parsedImportance = Number(frontmatter.importance);
  const importance = Number.isFinite(parsedImportance) ? parsedImportance : 0.5;
  const parsedUsageCount = parseInt(frontmatter.usageCount, 10);
  const usageCount = Number.isFinite(parsedUsageCount) ? parsedUsageCount : 0;
  const pinned = frontmatter.pinned === "true";
  const tags = frontmatter.tags ? parseArrayField(frontmatter.tags).join(",") : "";
  const now = new Date().toISOString();

  const existing = getDb().select().from(memories).where(eq(memories.vaultRelPath, relPath)).get();
  if (existing) {
    const changes: Partial<typeof memories.$inferInsert> = {};
    if (existing.content !== body) changes.content = body;
    if (existing.tags !== tags) changes.tags = tags;
    if (existing.type !== type) changes.type = type;
    if (existing.importance !== importance) changes.importance = importance;
    if (existing.usageCount !== usageCount) changes.usageCount = usageCount;
    if (!!existing.isPinned !== pinned) changes.isPinned = pinned;
    if (Object.keys(changes).length === 0) {
      getDb()
        .update(memories)
        .set({ vaultSyncedAt: now })
        .where(eq(memories.id, existing.id))
        .run();
      return;
    }
    changes.vaultSyncedAt = now;
    getDb().update(memories).set(changes).where(eq(memories.id, existing.id)).run();
    return;
  }

  getDb()
    .insert(memories)
    .values({
      id: randomUUID(),
      content: body,
      type,
      tags,
      importance,
      usageCount,
      source: "obsidian-vault",
      isPinned: pinned,
      vaultRelPath: relPath,
      vaultSyncedAt: now,
      createdAt: now,
    })
    .run();
}

function isStale(absPath: string, syncedAt: string | null): boolean {
  if (!syncedAt) return true;
  try {
    return fs.statSync(absPath).mtime.getTime() > new Date(syncedAt).getTime();
  } catch {
    return false;
  }
}

function walkMdFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export function reconcileAll(): {
  notesToVault: number;
  notesFromVault: number;
  memoriesToVault: number;
  memoriesFromVault: number;
} {
  const zero = { notesToVault: 0, notesFromVault: 0, memoriesToVault: 0, memoriesFromVault: 0 };
  if (getSetting("obsidianSyncEnabled") !== "1") return zero;
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath || !fs.existsSync(vaultPath)) return zero;

  const direction = getSetting("obsidianSyncDirection") || "bidirectional";
  const result = { ...zero };

  if (direction === "bidirectional" || direction === "to-vault") {
    const pendingNotes = getDb().select().from(notes).where(isNull(notes.vaultRelPath)).all();
    for (const note of pendingNotes) {
      try {
        syncNoteToVault(note);
        result.notesToVault++;
      } catch (err) {
        console.error("[obsidian-sync] syncNoteToVault failed", err);
      }
    }

    const pendingMemories = getDb()
      .select()
      .from(memories)
      .where(isNull(memories.vaultRelPath))
      .all();
    for (const memory of pendingMemories) {
      try {
        syncMemoryToVault(memory);
        result.memoriesToVault++;
      } catch (err) {
        console.error("[obsidian-sync] syncMemoryToVault failed", err);
      }
    }
  }

  if (direction === "bidirectional" || direction === "from-vault") {
    const notesDir = path.join(vaultPath, NOTES_SUBDIR);
    if (fs.existsSync(notesDir)) {
      for (const absPath of walkMdFiles(notesDir)) {
        const relPath = path.relative(notesDir, absPath);
        const existing = getDb().select().from(notes).where(eq(notes.vaultRelPath, relPath)).get();
        if (existing && !isStale(absPath, existing.vaultSyncedAt)) continue;
        try {
          syncNoteFromVault(absPath);
          result.notesFromVault++;
        } catch (err) {
          console.error("[obsidian-sync] syncNoteFromVault failed", err);
        }
      }
    }

    const memoriesDir = path.join(vaultPath, MEMORIES_SUBDIR);
    if (fs.existsSync(memoriesDir)) {
      for (const absPath of walkMdFiles(memoriesDir)) {
        const relPath = path.relative(memoriesDir, absPath);
        const existing = getDb()
          .select()
          .from(memories)
          .where(eq(memories.vaultRelPath, relPath))
          .get();
        if (existing && !isStale(absPath, existing.vaultSyncedAt)) continue;
        try {
          syncMemoryFromVault(absPath);
          result.memoriesFromVault++;
        } catch (err) {
          console.error("[obsidian-sync] syncMemoryFromVault failed", err);
        }
      }
    }
  }

  return result;
}

// The watcher is a singleton background process, cached on globalThis (distinct
// key from the daemon's own cache in lib/services/daemon.ts) so Next.js HMR /
// multiple route imports don't spawn duplicate chokidar instances.
const g = globalThis as unknown as { __matrixObsidianWatcher?: FSWatcher };

export function initWatcher(): void {
  if (g.__matrixObsidianWatcher) return;
  if (getSetting("obsidianSyncEnabled") !== "1") return;
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath || !fs.existsSync(vaultPath)) return;

  const notesDir = path.join(vaultPath, NOTES_SUBDIR);
  const memoriesDir = path.join(vaultPath, MEMORIES_SUBDIR);
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(memoriesDir, { recursive: true });

  const resolvedNotesDir = path.resolve(notesDir) + path.sep;
  const resolvedMemoriesDir = path.resolve(memoriesDir) + path.sep;

  const watcher = watch([notesDir, memoriesDir], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });

  const handle = (changedPath: string) => {
    try {
      if (!changedPath.endsWith(".md")) return;
      const resolved = path.resolve(changedPath);
      if (resolved.startsWith(resolvedNotesDir)) {
        syncNoteFromVault(resolved);
      } else if (resolved.startsWith(resolvedMemoriesDir)) {
        syncMemoryFromVault(resolved);
      }
    } catch (err) {
      console.error("[obsidian-sync] watcher handler failed", err);
    }
  };

  watcher.on("add", handle);
  watcher.on("change", handle);

  g.__matrixObsidianWatcher = watcher;
}

export function stopWatcher(): void {
  if (!g.__matrixObsidianWatcher) return;
  g.__matrixObsidianWatcher.close().catch(() => {});
  g.__matrixObsidianWatcher = undefined;
}

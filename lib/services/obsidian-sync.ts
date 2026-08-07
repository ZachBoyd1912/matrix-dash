import crypto, { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq, isNull } from "drizzle-orm";
import { watch, type FSWatcher } from "chokidar";
import { getDb } from "@/lib/db/client";
import { notes, memories } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";
import { tryRemoteFs } from "./runner-fs";
import type { TreeEntry } from "@/types/workspace";

export const NOTES_SUBDIR = "Matrix Notes";
export const MEMORIES_SUBDIR = "Memory Bank";
const MEMORY_TYPES = ["identity", "project", "global", "lesson"] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * Remove a file from the vault, one implementation shared by every caller.
 * Prefers the paired device: in production the vault lives on the owner's Mac,
 * where a local rmSync silently no-ops — leaving the file behind to be
 * re-imported as a brand new note on the next reconcile, so a deleted note
 * appears to resurrect itself.
 *
 * Returns true when the file was actually removed somewhere.
 */
export async function deleteVaultFile(subdir: string, relPath: string): Promise<boolean> {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return false;
  const abs = path.join(vaultPath, subdir, relPath);

  const remote = await tryRemoteFs("delete", { path: abs });
  if (remote.handled) {
    if (!remote.result.ok) {
      console.error("[obsidian-sync] remote vault delete failed:", remote.result.error);
    }
    return remote.result.ok;
  }

  try {
    fs.rmSync(abs, { force: true });
    return true;
  } catch (err) {
    console.error("[obsidian-sync] local vault delete failed:", err);
    return false;
  }
}

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

// Filesystem-agnostic merge core, shared by two callers with very different
// ways of getting the raw content: the local-fs path below (reads via
// fs.readFileSync — used by the chokidar watcher and a same-host reconcile
// walk) and the browser sync path (app/api/notes/sync/browser-apply — the
// File System Access API already read the file in the browser, so the
// server never touches disk for that path at all). `syncedAt` is caller-
// supplied rather than always "now" so a browser-reported post-write mtime
// can be stamped instead of server time — see stampNoteSynced's comment.
export function applyNoteFromVaultContent(relPath: string, raw: string, syncedAt: string): void {
  const { frontmatter, body } = parseFrontmatter(raw);
  const tags = frontmatter.tags ? parseArrayField(frontmatter.tags).join(",") : "";
  const favorite = frontmatter.favorite === "true";

  const existing = getDb().select().from(notes).where(eq(notes.vaultRelPath, relPath)).get();
  if (existing) {
    const changes: Partial<typeof notes.$inferInsert> = {};
    if (existing.content !== body) changes.content = body;
    if (existing.tags !== tags) changes.tags = tags;
    if (!!existing.isFavorite !== favorite) changes.isFavorite = favorite;
    if (Object.keys(changes).length === 0) {
      getDb().update(notes).set({ vaultSyncedAt: syncedAt }).where(eq(notes.id, existing.id)).run();
      return;
    }
    changes.vaultSyncedAt = syncedAt;
    changes.updatedAt = syncedAt;
    getDb().update(notes).set(changes).where(eq(notes.id, existing.id)).run();
    return;
  }

  getDb()
    .insert(notes)
    .values({
      id: randomUUID(),
      title: path.basename(relPath, ".md"),
      content: body,
      tags,
      isFavorite: favorite,
      vaultRelPath: relPath,
      vaultSyncedAt: syncedAt,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    })
    .run();
}

export function applyMemoryFromVaultContent(relPath: string, raw: string, syncedAt: string): void {
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
        .set({ vaultSyncedAt: syncedAt })
        .where(eq(memories.id, existing.id))
        .run();
      return;
    }
    changes.vaultSyncedAt = syncedAt;
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
      vaultSyncedAt: syncedAt,
      createdAt: syncedAt,
    })
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
  applyNoteFromVaultContent(relPath, raw, new Date().toISOString());
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
  applyMemoryFromVaultContent(relPath, raw, new Date().toISOString());
}

/**
 * Marks a DB row as freshly pushed to the vault by a caller that did the
 * actual write itself (the browser, via the File System Access API — the
 * server has no filesystem access to the browser's chosen directory at
 * all). Stamps vaultSyncedAt with the CALLER-reported post-write mtime
 * rather than server "now": the next manifest diff compares a vault file's
 * mtime against this value to decide whether it looks like an external
 * edit, so if we stamped server time instead, clock skew or the round-trip
 * delay could make an untouched file look stale and get re-imported as if
 * the user had edited it.
 */
export function stampNoteSynced(id: string, relPath: string, syncedAt: string): void {
  getDb()
    .update(notes)
    .set({ vaultRelPath: relPath, vaultSyncedAt: syncedAt })
    .where(eq(notes.id, id))
    .run();
}

export function stampMemorySynced(id: string, relPath: string, syncedAt: string): void {
  getDb()
    .update(memories)
    .set({ vaultRelPath: relPath, vaultSyncedAt: syncedAt })
    .where(eq(memories.id, id))
    .run();
}

/** Vault-relative filename + rendered content for a DB row that needs to be
 * pushed to the vault — used by the browser sync manifest endpoint to hand
 * the browser exactly what syncNoteToVault/syncMemoryToVault would have
 * written to local disk, without this module touching fs at all. */
export function renderNoteForVault(note: typeof notes.$inferSelect): {
  filename: string;
  content: string;
} {
  let filename = sanitizeFilename(note.title || note.id);
  const conflict = getDb().select().from(notes).where(eq(notes.vaultRelPath, filename)).get();
  if (conflict && conflict.id !== note.id) {
    filename = filename.replace(/\.md$/, ` (${note.id.slice(0, 4)}).md`);
  }
  const tags = note.tags
    ? note.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const frontmatter = buildFrontmatter({ tags, favorite: !!note.isFavorite });
  return { filename, content: frontmatter + note.content };
}

export function renderMemoryForVault(memory: typeof memories.$inferSelect): {
  filename: string;
  content: string;
} {
  let filename = sanitizeFilename(memory.content.slice(0, 60) || memory.id);
  const conflict = getDb().select().from(memories).where(eq(memories.vaultRelPath, filename)).get();
  if (conflict && conflict.id !== memory.id) {
    filename = filename.replace(/\.md$/, ` (${memory.id.slice(0, 4)}).md`);
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
  return { filename, content: frontmatter + memory.content };
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

export interface VaultManifestEntry {
  relPath: string;
  mtimeMs: number;
}

/**
 * Same diff `reconcileAll()`'s local-fs walk does, but driven by a manifest
 * the BROWSER reports (via the File System Access API) instead of an
 * `fs.readdirSync` walk — this is what makes browser-based sync possible at
 * all when the server process can't see the user's chosen directory (e.g.
 * production running on a VM, vault living on the user's own machine).
 * Mirrors reconcileAll()'s own semantics: to-vault only considers rows with
 * no vaultRelPath yet (isNull), matching what the existing reconcile does
 * today rather than adding a new "modified since" comparison.
 */
export function planBrowserSync(manifest: {
  notes: VaultManifestEntry[];
  memories: VaultManifestEntry[];
}): {
  push: {
    notes: { id: string; relPath: string; content: string }[];
    memories: { id: string; relPath: string; content: string }[];
  };
  pull: { notes: string[]; memories: string[] };
} {
  const pendingNotes = getDb().select().from(notes).where(isNull(notes.vaultRelPath)).all();
  const pendingMemories = getDb()
    .select()
    .from(memories)
    .where(isNull(memories.vaultRelPath))
    .all();

  const push = {
    notes: pendingNotes.map((n) => {
      const { filename, content } = renderNoteForVault(n);
      return { id: n.id, relPath: filename, content };
    }),
    memories: pendingMemories.map((m) => {
      const { filename, content } = renderMemoryForVault(m);
      return { id: m.id, relPath: filename, content };
    }),
  };

  const pullNotes: string[] = [];
  for (const entry of manifest.notes) {
    const existing = getDb()
      .select()
      .from(notes)
      .where(eq(notes.vaultRelPath, entry.relPath))
      .get();
    if (!existing) pullNotes.push(entry.relPath);
    else if (!existing.vaultSyncedAt || entry.mtimeMs > new Date(existing.vaultSyncedAt).getTime())
      pullNotes.push(entry.relPath);
  }

  const pullMemories: string[] = [];
  for (const entry of manifest.memories) {
    const existing = getDb()
      .select()
      .from(memories)
      .where(eq(memories.vaultRelPath, entry.relPath))
      .get();
    if (!existing) pullMemories.push(entry.relPath);
    else if (!existing.vaultSyncedAt || entry.mtimeMs > new Date(existing.vaultSyncedAt).getTime())
      pullMemories.push(entry.relPath);
  }

  return { push, pull: { notes: pullNotes, memories: pullMemories } };
}

export interface ReconcileResult {
  notesToVault: number;
  notesFromVault: number;
  memoriesToVault: number;
  memoriesFromVault: number;
}

const RECONCILE_ZERO: ReconcileResult = {
  notesToVault: 0,
  notesFromVault: 0,
  memoriesToVault: 0,
  memoriesFromVault: 0,
};

/**
 * Whether the configured vault is reachable at all — locally, or via a
 * paired Matrix Runner device. Exported so daemon.ts's cron can write an
 * honest status (vs. a silent no-op that looks identical to "ran fine,
 * nothing to sync") without duplicating reconcileAll()'s own reachability
 * logic.
 */
export async function isVaultReachable(vaultPath: string): Promise<boolean> {
  if (fs.existsSync(vaultPath)) return true;
  const remote = await tryRemoteFs("list", { path: vaultPath });
  return remote.handled && remote.result.ok;
}

/**
 * Reconcile notes + memories against the vault. Tries THIS HOST's filesystem
 * first (unchanged local-dev behavior) and only falls back to the Matrix
 * Runner bridge when the path isn't visible here — which is the normal case
 * in production, where the app runs on a VM that can never see a Mac path.
 * Without the remote branch this was a permanent no-op in production: the
 * old fs.existsSync(vaultPath) check simply failed forever.
 */
export async function reconcileAll(): Promise<ReconcileResult> {
  if (getSetting("obsidianSyncEnabled") !== "1") return RECONCILE_ZERO;
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return RECONCILE_ZERO;

  const direction = getSetting("obsidianSyncDirection") || "bidirectional";

  if (fs.existsSync(vaultPath)) {
    return reconcileAllLocal(vaultPath, direction);
  }

  const remote = await tryRemoteFs("list", { path: vaultPath });
  if (!remote.handled || !remote.result.ok) return RECONCILE_ZERO;
  return reconcileAllRemote(vaultPath, direction);
}

function reconcileAllLocal(vaultPath: string, direction: string): ReconcileResult {
  const result = { ...RECONCILE_ZERO };

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

/** Depth-first flatten of a remote "tree" op's result down to .md files. */
function flattenMdFiles(entries: TreeEntry[]): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const e of entries) {
    if (e.type === "file" && e.name.endsWith(".md")) out.push(e);
    else if (e.type === "dir" && e.children) out.push(...flattenMdFiles(e.children));
  }
  return out;
}

/**
 * Same semantics as reconcileAllLocal, but every fs touch is a round-trip
 * through the paired device instead of this host's fs module — see
 * lib/services/runner-fs.ts (tryRemoteFs) and runner/src/fs-ops.ts.
 */
async function reconcileAllRemote(vaultPath: string, direction: string): Promise<ReconcileResult> {
  const result = { ...RECONCILE_ZERO };
  const now = () => new Date().toISOString();

  if (direction === "bidirectional" || direction === "to-vault") {
    const pendingNotes = getDb().select().from(notes).where(isNull(notes.vaultRelPath)).all();
    for (const note of pendingNotes) {
      try {
        const { filename, content } = renderNoteForVault(note);
        const target = path.join(vaultPath, NOTES_SUBDIR, filename);
        const write = await tryRemoteFs("write", { path: target, content });
        if (write.handled && write.result.ok) {
          stampNoteSynced(note.id, filename, now());
          result.notesToVault++;
        } else if (write.handled) {
          console.error("[obsidian-sync] remote write (note) failed", write.result.error);
        }
      } catch (err) {
        console.error("[obsidian-sync] remote syncNoteToVault failed", err);
      }
    }

    const pendingMemories = getDb()
      .select()
      .from(memories)
      .where(isNull(memories.vaultRelPath))
      .all();
    for (const memory of pendingMemories) {
      try {
        const { filename, content } = renderMemoryForVault(memory);
        const target = path.join(vaultPath, MEMORIES_SUBDIR, filename);
        const write = await tryRemoteFs("write", { path: target, content });
        if (write.handled && write.result.ok) {
          stampMemorySynced(memory.id, filename, now());
          result.memoriesToVault++;
        } else if (write.handled) {
          console.error("[obsidian-sync] remote write (memory) failed", write.result.error);
        }
      } catch (err) {
        console.error("[obsidian-sync] remote syncMemoryToVault failed", err);
      }
    }
  }

  if (direction === "bidirectional" || direction === "from-vault") {
    const notesDir = path.join(vaultPath, NOTES_SUBDIR);
    const notesTree = await tryRemoteFs("tree", { root: notesDir });
    if (notesTree.handled && notesTree.result.ok) {
      const data = notesTree.result.data as { tree: TreeEntry[] } | undefined;
      for (const entry of flattenMdFiles(data?.tree ?? [])) {
        const relPath = path.relative(notesDir, entry.path);
        const existing = getDb().select().from(notes).where(eq(notes.vaultRelPath, relPath)).get();
        const stale =
          !existing?.vaultSyncedAt ||
          entry.mtimeMs === undefined ||
          entry.mtimeMs > new Date(existing.vaultSyncedAt).getTime();
        if (existing && !stale) continue;
        try {
          const read = await tryRemoteFs("read", { path: entry.path });
          if (read.handled && read.result.ok) {
            const fileData = read.result.data as { content: string } | undefined;
            if (fileData) {
              applyNoteFromVaultContent(relPath, fileData.content, now());
              result.notesFromVault++;
            }
          } else if (read.handled) {
            console.error("[obsidian-sync] remote read (note) failed", read.result.error);
          }
        } catch (err) {
          console.error("[obsidian-sync] remote syncNoteFromVault failed", err);
        }
      }
    }

    const memoriesDir = path.join(vaultPath, MEMORIES_SUBDIR);
    const memoriesTree = await tryRemoteFs("tree", { root: memoriesDir });
    if (memoriesTree.handled && memoriesTree.result.ok) {
      const data = memoriesTree.result.data as { tree: TreeEntry[] } | undefined;
      for (const entry of flattenMdFiles(data?.tree ?? [])) {
        const relPath = path.relative(memoriesDir, entry.path);
        const existing = getDb()
          .select()
          .from(memories)
          .where(eq(memories.vaultRelPath, relPath))
          .get();
        const stale =
          !existing?.vaultSyncedAt ||
          entry.mtimeMs === undefined ||
          entry.mtimeMs > new Date(existing.vaultSyncedAt).getTime();
        if (existing && !stale) continue;
        try {
          const read = await tryRemoteFs("read", { path: entry.path });
          if (read.handled && read.result.ok) {
            const fileData = read.result.data as { content: string } | undefined;
            if (fileData) {
              applyMemoryFromVaultContent(relPath, fileData.content, now());
              result.memoriesFromVault++;
            }
          } else if (read.handled) {
            console.error("[obsidian-sync] remote read (memory) failed", read.result.error);
          }
        } catch (err) {
          console.error("[obsidian-sync] remote syncMemoryFromVault failed", err);
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

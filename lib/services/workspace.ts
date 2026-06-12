import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { languageFromPath } from "@/lib/utils/language";
import type { FileReadResult, TreeEntry, WorkspaceRecord } from "@/types/workspace";

/** Directories never walked into — heavy, generated, or VCS internals. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "venv",
  ".venv",
  ".idea",
  ".gradle",
  "target",
  ".DS_Store",
]);

const MAX_DEPTH = 8;
const MAX_ENTRIES = 6000;
const MAX_FILE_BYTES = 500 * 1024;

export class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Reject empty, relative, or null-byte-laced paths before touching the fs. */
function assertAbsolute(p: unknown): string {
  if (typeof p !== "string" || !p.trim()) throw new WorkspaceError("Path is required");
  if (p.includes("\0")) throw new WorkspaceError("Invalid path");
  const resolved = path.resolve(p);
  if (!path.isAbsolute(resolved)) throw new WorkspaceError("Path must be absolute");
  return resolved;
}

// ─── Workspace registry (DB) ──────────────────────────────

function toRecord(row: typeof workspaces.$inferSelect): WorkspaceRecord {
  return { id: row.id, path: row.path, name: row.name, lastOpened: row.lastOpened };
}

export function listWorkspaces(): WorkspaceRecord[] {
  return getDb().select().from(workspaces).orderBy(desc(workspaces.lastOpened)).all().map(toRecord);
}

export function registerWorkspace(rawPath: string): WorkspaceRecord {
  const abs = assertAbsolute(rawPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new WorkspaceError("Folder does not exist", 404);
  }
  if (!stat.isDirectory()) throw new WorkspaceError("Path is not a directory");

  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.select().from(workspaces).where(eq(workspaces.path, abs)).get();
  if (existing) {
    db.update(workspaces).set({ lastOpened: now }).where(eq(workspaces.id, existing.id)).run();
    return toRecord({ ...existing, lastOpened: now });
  }
  const record = {
    id: randomUUID(),
    path: abs,
    name: path.basename(abs) || abs,
    lastOpened: now,
  };
  db.insert(workspaces).values(record).run();
  return record;
}

export function removeWorkspace(id: string): void {
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
}

export function touchWorkspace(rawPath: string): void {
  const abs = assertAbsolute(rawPath);
  getDb()
    .update(workspaces)
    .set({ lastOpened: new Date().toISOString() })
    .where(eq(workspaces.path, abs))
    .run();
}

// ─── Filesystem operations ────────────────────────────────

function walk(dir: string, depth: number, counter: { n: number }): TreeEntry[] {
  if (depth > MAX_DEPTH || counter.n >= MAX_ENTRIES) return [];
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  // Folders first, then files; alphabetical within each group.
  dirents.sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1;
    const bd = b.isDirectory() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });

  const out: TreeEntry[] = [];
  for (const d of dirents) {
    if (counter.n >= MAX_ENTRIES) break;
    if (IGNORED_DIRS.has(d.name)) continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      counter.n++;
      out.push({
        name: d.name,
        path: full,
        type: "dir",
        children: walk(full, depth + 1, counter),
      });
    } else if (d.isFile()) {
      counter.n++;
      out.push({ name: d.name, path: full, type: "file" });
    }
    // Symlinks, sockets, devices are skipped to avoid cycles.
  }
  return out;
}

export function readTree(rawRoot: string): { root: string; name: string; tree: TreeEntry[] } {
  const root = assertAbsolute(rawRoot);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    throw new WorkspaceError("Folder does not exist", 404);
  }
  if (!stat.isDirectory()) throw new WorkspaceError("Path is not a directory");
  return { root, name: path.basename(root) || root, tree: walk(root, 0, { n: 0 }) };
}

export function readFileContent(rawPath: string): FileReadResult {
  const abs = assertAbsolute(rawPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new WorkspaceError("File does not exist", 404);
  }
  if (stat.isDirectory()) throw new WorkspaceError("Path is a directory");

  const truncated = stat.size > MAX_FILE_BYTES;
  const fd = fs.openSync(abs, "r");
  try {
    const length = truncated ? MAX_FILE_BYTES : stat.size;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, 0);
    return {
      path: abs,
      content: buf.toString("utf8"),
      language: languageFromPath(abs),
      truncated,
      bytes: stat.size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function writeFileContent(rawPath: string, content: string): void {
  const abs = assertAbsolute(rawPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

export function createFile(rawPath: string): string {
  const abs = assertAbsolute(rawPath);
  if (fs.existsSync(abs)) throw new WorkspaceError("File already exists", 409);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "", "utf8");
  return abs;
}

export function makeDir(rawPath: string): string {
  const abs = assertAbsolute(rawPath);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

export function deleteEntry(rawPath: string): void {
  const abs = assertAbsolute(rawPath);
  if (!fs.existsSync(abs)) throw new WorkspaceError("Path does not exist", 404);
  fs.rmSync(abs, { recursive: true, force: true });
}

export function renameEntry(rawFrom: string, rawTo: string): string {
  const from = assertAbsolute(rawFrom);
  const to = assertAbsolute(rawTo);
  if (!fs.existsSync(from)) throw new WorkspaceError("Source does not exist", 404);
  if (fs.existsSync(to)) throw new WorkspaceError("Target already exists", 409);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return to;
}

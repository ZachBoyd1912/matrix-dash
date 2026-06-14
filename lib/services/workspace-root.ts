import fs from "fs";
import path from "path";
import { WorkspaceError } from "./workspace";

/**
 * Resolve a relative-or-absolute path against the workspace root and guarantee it
 * stays inside. `assertAbsolute` in workspace.ts only rejects relative/null-byte
 * paths — it does NOT stop `../` escape — so coding tools MUST funnel through here,
 * or a write/bash in approval/unrestricted mode could touch the whole disk.
 */
export function resolveInRoot(root: string, raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) throw new WorkspaceError("Path is required");
  if (raw.includes("\0")) throw new WorkspaceError("Invalid path");
  const base = path.resolve(root);
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(base, raw);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new WorkspaceError("Path escapes the workspace root", 403);
  }
  // Symlink hardening: an existing parent's realpath must also stay inside root,
  // defeating a symlink planted inside the workspace that points outside it.
  try {
    const parent = path.dirname(abs);
    if (fs.existsSync(parent)) {
      const realParent = fs.realpathSync(parent);
      const realBase = fs.existsSync(base) ? fs.realpathSync(base) : base;
      if (realParent !== realBase && !realParent.startsWith(realBase + path.sep)) {
        throw new WorkspaceError("Path escapes the workspace root", 403);
      }
    }
  } catch (e) {
    if (e instanceof WorkspaceError) throw e;
    // A non-symlink realpath failure (e.g. permissions) — the string check passed.
  }
  return abs;
}

/** Display a path relative to root (Claude-Code-style short paths), else the abs path. */
export function relToRoot(root: string, abs: string): string {
  const rel = path.relative(path.resolve(root), abs);
  return rel && !rel.startsWith("..") ? rel : abs;
}

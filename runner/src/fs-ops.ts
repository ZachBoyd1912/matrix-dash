import fs from "fs";
import os from "os";
import path from "path";
import { languageFromPath } from "@/lib/utils/language";
import type { TreeEntry, FileReadResult } from "@/types/workspace";

/**
 * Local filesystem operations the device performs for the dashboard's workspace
 * browser (P4 parity). The user browses THEIR OWN machine. Every path is
 * confined under the workspace root (MATRIX_RUNNER_WORKSPACE or home), so a
 * compromised control plane can't read arbitrary disk via fs_op. Output shapes
 * match lib/services/workspace.ts (readTree/readFileContent) so the existing
 * routes/UI render device results with zero mapping.
 */

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

function root(): string {
  return process.env.MATRIX_RUNNER_WORKSPACE || os.homedir();
}

/** Resolve `p` and require it to sit inside the workspace root. */
function confine(p: string): string {
  const base = root();
  const abs = path.resolve(base, p || ".");
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error("Path escapes the workspace root");
  }
  return abs;
}

function walk(dir: string, depth: number, counter: { n: number }): TreeEntry[] {
  if (depth > MAX_DEPTH || counter.n >= MAX_ENTRIES) return [];
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
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
      out.push({ name: d.name, path: full, type: "dir", children: walk(full, depth + 1, counter) });
    } else if (d.isFile()) {
      counter.n++;
      out.push({ name: d.name, path: full, type: "file" });
    }
  }
  return out;
}

export async function handleFsOp(
  op: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const p = typeof args.path === "string" ? args.path : "";
    switch (op) {
      case "tree": {
        const dir = confine(typeof args.root === "string" && args.root ? args.root : p);
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) return { ok: false, error: "Path is not a directory" };
        const data: { root: string; name: string; tree: TreeEntry[] } = {
          root: dir,
          name: path.basename(dir) || dir,
          tree: walk(dir, 0, { n: 0 }),
        };
        return { ok: true, data };
      }
      case "list": {
        const dir = confine(p);
        const entries = fs
          .readdirSync(dir, { withFileTypes: true })
          .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
        return { ok: true, data: { root: root(), path: p, entries } };
      }
      case "read": {
        const f = confine(p);
        const stat = fs.statSync(f);
        if (stat.isDirectory()) return { ok: false, error: "Path is a directory" };
        const truncated = stat.size > MAX_FILE_BYTES;
        const fd = fs.openSync(f, "r");
        try {
          const length = truncated ? MAX_FILE_BYTES : stat.size;
          const buf = Buffer.alloc(length);
          fs.readSync(fd, buf, 0, length, 0);
          const data: FileReadResult = {
            path: f,
            content: buf.toString("utf8"),
            language: languageFromPath(f),
            truncated,
            bytes: stat.size,
          };
          return { ok: true, data };
        } finally {
          fs.closeSync(fd);
        }
      }
      case "write": {
        const f = confine(p);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, String(args.content ?? ""), "utf8");
        return { ok: true, data: { path: f } };
      }
      case "create": {
        const f = confine(p);
        if (fs.existsSync(f)) return { ok: false, error: "File already exists" };
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, String(args.content ?? ""), "utf8");
        return { ok: true, data: { path: f } };
      }
      case "mkdir": {
        const dir = confine(p);
        fs.mkdirSync(dir, { recursive: true });
        return { ok: true, data: { path: dir } };
      }
      case "rename": {
        const from = confine(p);
        const to = confine(typeof args.to === "string" ? args.to : "");
        if (fs.existsSync(to)) return { ok: false, error: "Target already exists" };
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        return { ok: true, data: { path: to } };
      }
      case "delete": {
        fs.rmSync(confine(p), { recursive: true, force: true });
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown fs op: ${op}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

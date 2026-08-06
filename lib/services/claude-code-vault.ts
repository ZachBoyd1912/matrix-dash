import fs from "fs";
import path from "path";
import { getSetting } from "@/lib/db/settings";
import { parseFrontmatter } from "./obsidian-sync";
import { tryRemoteFs } from "./runner-fs";
import type { TreeEntry } from "@/types/workspace";
import type {
  ClaudeCodeFileContent,
  ClaudeCodeProjectSummary,
  ClaudeCodeTree,
} from "@/types/vault";

/**
 * Read-only browse of Claude Code's own per-project memory folder inside the
 * shared Obsidian vault (see docs/obsidian-vault-layer.md). Deliberately the
 * mirror image of obsidian-sync.ts: that module WRITES matrix-dash's own
 * Notes/Memory Bank folders two-way; this one only ever READS Claude Code's
 * folder — writing into a format matrix-dash doesn't own risks corrupting
 * it. No write functions exist here on purpose, not just by convention.
 *
 * Scoped to "Claude Code/Memory" specifically, not "Claude Code" — the
 * sibling "Sessions/" folder and root "README.md" aren't memory files.
 */
export const CLAUDE_CODE_SUBDIR = "Claude Code/Memory";

/** Rejects traversal/separator characters — called before any fs/remote access. */
export function sanitizeSegment(s: string): string {
  if (!s || s === "." || s === ".." || /[/\\]/.test(s)) {
    throw new Error("Invalid path segment");
  }
  return s;
}

function claudeCodeDir(vaultPath: string): string {
  return path.join(vaultPath, CLAUDE_CODE_SUBDIR);
}

function treeToProjects(tree: TreeEntry[]): ClaudeCodeProjectSummary[] {
  const projects: ClaudeCodeProjectSummary[] = [];
  for (const entry of tree) {
    if (entry.type !== "dir") continue;
    const files = (entry.children ?? [])
      .filter((c) => c.type === "file" && c.name.endsWith(".md"))
      .map((c) => ({
        project: entry.name,
        relPath: c.name,
        name: c.name.replace(/\.md$/, ""),
        mtimeMs: c.mtimeMs,
      }));
    projects.push({ name: entry.name, files });
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

const MAX_DEPTH = 3;

function walkLocal(dir: string, depth: number): TreeEntry[] {
  if (depth > MAX_DEPTH) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeEntry[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ name: e.name, path: full, type: "dir", children: walkLocal(full, depth + 1) });
    } else if (e.isFile() && e.name.endsWith(".md")) {
      let mtimeMs: number | undefined;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        /* raced delete — omit mtime, entry still lists */
      }
      out.push({ name: e.name, path: full, type: "file", mtimeMs });
    }
  }
  return out;
}

/** Local filesystem first (dev, or a host that genuinely has the vault), else the paired device. */
export async function readClaudeCodeTree(): Promise<ClaudeCodeTree> {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return { projects: [], unreachable: true };
  const dir = claudeCodeDir(vaultPath);

  if (fs.existsSync(dir)) {
    return { projects: treeToProjects(walkLocal(dir, 0)), unreachable: false };
  }

  const remote = await tryRemoteFs("tree", { root: dir });
  if (!remote.handled || !remote.result.ok) return { projects: [], unreachable: true };
  const data = remote.result.data as { tree: TreeEntry[] } | undefined;
  return { projects: treeToProjects(data?.tree ?? []), unreachable: false };
}

/** Same local-then-remote fallback for a single file's content. */
export async function readClaudeCodeFile(
  project: string,
  file: string
): Promise<ClaudeCodeFileContent | null> {
  sanitizeSegment(project);
  sanitizeSegment(file);
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return null;
  const abs = path.join(claudeCodeDir(vaultPath), project, file);
  const name = file.replace(/\.md$/, "");

  if (fs.existsSync(abs)) {
    let raw: string;
    try {
      raw = fs.readFileSync(abs, "utf-8");
    } catch {
      return null;
    }
    const { frontmatter, body } = parseFrontmatter(raw);
    let mtimeMs: number | undefined;
    try {
      mtimeMs = fs.statSync(abs).mtimeMs;
    } catch {
      /* raced delete — omit mtime */
    }
    return { project, relPath: file, name, frontmatter, body, raw, mtimeMs };
  }

  const remote = await tryRemoteFs("read", { path: abs });
  if (!remote.handled || !remote.result.ok) return null;
  const data = remote.result.data as { content: string } | undefined;
  if (!data) return null;
  const { frontmatter, body } = parseFrontmatter(data.content);
  return { project, relPath: file, name, frontmatter, body, raw: data.content };
}

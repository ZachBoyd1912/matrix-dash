import fs from "fs";
import path from "path";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getSetting } from "@/lib/db/settings";
import { readFileContent, writeFileContent, WorkspaceError } from "@/lib/services/workspace";
import { resolveInRoot, relToRoot } from "@/lib/services/workspace-root";
import { runBash } from "@/lib/ai/bash";
import { isToolAllowed, type PowerLevel } from "@/lib/ai/power";

/** Directories never searched/listed — heavy, generated, or VCS internals. */
const IGNORED = new Set([
  "node_modules", ".git", ".next", ".turbo", ".cache", "dist", "build", "out",
  "coverage", "__pycache__", ".pytest_cache", ".venv", "venv", ".idea", "target", ".DS_Store",
]);

const WALK_MAX_FILES = 4000;
const GREP_MAX_FILE_BYTES = 512 * 1024;

function errResult(e: unknown): { error: string } {
  if (e instanceof WorkspaceError) return { error: e.message };
  return { error: e instanceof Error ? e.message : String(e) };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/**
 * Interim approval gate for Phase 3 (`approval` level): block a mutating tool unless
 * its `approve_<tool>` flag is set. Phase 4 replaces this with interactive inline
 * Allow/Deny. `unrestricted` skips it; `sandboxed` never registers these tools.
 */
function approvalGuard(toolName: string, level: PowerLevel): { blocked: true; reason: string } | null {
  if (level === "approval" && getSetting(`approve_${toolName}`) !== "1") {
    return {
      blocked: true,
      reason: `'${toolName}' needs approval. Enable it in Settings → Agent Tools, or set the power level to Unrestricted.`,
    };
  }
  return null;
}

/** Walk files under `dir`, calling `cb(file)`; return false from cb to stop early. */
function walkFiles(dir: string, cb: (file: string) => boolean, depth = 0): boolean {
  if (depth > 12) return true;
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const d of dirents) {
    if (IGNORED.has(d.name)) continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (!walkFiles(full, cb, depth + 1)) return false;
    } else if (d.isFile()) {
      if (!cb(full)) return false;
    }
  }
  return true;
}

/** Minimal glob → RegExp supporting **, *, ?. Matches against a relative path. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") re += "[^/]";
    else if ("/.+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(`^${re}$`, "i");
}

/**
 * Claude-Code-parity coding tools, scoped to `root` and gated by `level`. In
 * `sandboxed` only the read-only tools are registered; mutating tools (write/edit/
 * multiEdit/bash) register at `approval`/`unrestricted`.
 */
export function buildCodingTools(level: PowerLevel, root: string): ToolSet {
  const toolset: ToolSet = {};

  toolset.readFileFs = tool({
    description:
      "Read a file from the workspace. Paths are relative to the workspace root (or absolute within it). Optional line offset/limit for large files.",
    inputSchema: z.object({
      path: z.string(),
      offset: z.number().int().optional().describe("1-based first line to read"),
      limit: z.number().int().optional().describe("max lines to read"),
    }),
    execute: async ({ path: p, offset, limit }) => {
      try {
        const abs = resolveInRoot(root, p);
        const res = readFileContent(abs);
        let content = res.content;
        if (offset != null || limit != null) {
          const lines = content.split("\n");
          const start = Math.max(0, (offset ?? 1) - 1);
          const end = limit != null ? start + limit : lines.length;
          content = lines.slice(start, end).join("\n");
        }
        return { path: relToRoot(root, abs), content, truncated: res.truncated };
      } catch (e) {
        return errResult(e);
      }
    },
  });

  toolset.grep = tool({
    description:
      "Search file contents under the workspace (or a subpath) for a regex pattern. Returns matching file/line/text.",
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      caseInsensitive: z.boolean().optional(),
      maxResults: z.number().int().optional(),
    }),
    execute: async ({ pattern, path: p, caseInsensitive, maxResults }) => {
      try {
        const baseAbs = p ? resolveInRoot(root, p) : path.resolve(root);
        const re = new RegExp(pattern, caseInsensitive ? "i" : "");
        const max = Math.min(maxResults ?? 100, 500);
        const hits: { file: string; line: number; text: string }[] = [];
        walkFiles(baseAbs, (file) => {
          let content: string;
          try {
            if (fs.statSync(file).size > GREP_MAX_FILE_BYTES) return true;
            content = fs.readFileSync(file, "utf8");
          } catch {
            return true;
          }
          if (content.includes("\0")) return true; // skip binary
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              hits.push({ file: relToRoot(root, file), line: i + 1, text: lines[i].slice(0, 300) });
              if (hits.length >= max) return false;
            }
          }
          return true;
        });
        return { matches: hits, truncated: hits.length >= max };
      } catch (e) {
        return errResult(e);
      }
    },
  });

  toolset.glob = tool({
    description:
      "List files under the workspace (or a subpath) matching a glob pattern (supports **, *, ?). Returns relative paths.",
    inputSchema: z.object({ pattern: z.string(), path: z.string().optional() }),
    execute: async ({ pattern, path: p }) => {
      try {
        const baseAbs = p ? resolveInRoot(root, p) : path.resolve(root);
        const re = globToRegExp(pattern);
        const out: string[] = [];
        walkFiles(baseAbs, (file) => {
          const rel = relToRoot(root, file);
          if (re.test(rel) || re.test(path.basename(file))) out.push(rel);
          return out.length < WALK_MAX_FILES;
        });
        return { files: out };
      } catch (e) {
        return errResult(e);
      }
    },
  });

  toolset.todoWrite = tool({
    description:
      "Record or update the structured task list for the current work. Use it to plan multi-step tasks and track progress.",
    inputSchema: z.object({
      todos: z.array(
        z.object({
          content: z.string(),
          status: z.enum(["pending", "in_progress", "completed"]),
          activeForm: z.string().optional(),
        })
      ),
    }),
    execute: async ({ todos }) => ({ todos }),
  });

  // ─── Mutating tools — only at approval / unrestricted ────────────────────────
  if (isToolAllowed("writeFileFs", level)) {
    toolset.writeFileFs = tool({
      description:
        "Create or overwrite a file in the workspace with the given content. Paths are relative to the workspace root.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: p, content }) => {
        const guard = approvalGuard("writeFileFs", level);
        if (guard) return guard;
        try {
          const abs = resolveInRoot(root, p);
          const created = !fs.existsSync(abs);
          writeFileContent(abs, content);
          return { written: true, path: relToRoot(root, abs), created };
        } catch (e) {
          return errResult(e);
        }
      },
    });

    toolset.editFile = tool({
      description:
        "Replace an exact string in a file. oldString must be unique unless replaceAll is set. Prefer this over rewriting whole files.",
      inputSchema: z.object({
        path: z.string(),
        oldString: z.string(),
        newString: z.string(),
        replaceAll: z.boolean().optional(),
      }),
      execute: async ({ path: p, oldString, newString, replaceAll }) => {
        const guard = approvalGuard("editFile", level);
        if (guard) return guard;
        try {
          const abs = resolveInRoot(root, p);
          const before = readFileContent(abs).content;
          const count = countOccurrences(before, oldString);
          if (count === 0) return { error: `oldString not found in ${relToRoot(root, abs)}` };
          if (count > 1 && !replaceAll)
            return { error: `oldString is not unique (${count} matches). Add context or pass replaceAll.` };
          const after = replaceAll ? before.split(oldString).join(newString) : before.replace(oldString, newString);
          writeFileContent(abs, after);
          return { edited: true, path: relToRoot(root, abs), replacements: replaceAll ? count : 1 };
        } catch (e) {
          return errResult(e);
        }
      },
    });

    toolset.multiEdit = tool({
      description: "Apply several exact-string edits to one file atomically (in order). Each oldString must match.",
      inputSchema: z.object({
        path: z.string(),
        edits: z.array(
          z.object({ oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() })
        ),
      }),
      execute: async ({ path: p, edits }) => {
        const guard = approvalGuard("multiEdit", level);
        if (guard) return guard;
        try {
          const abs = resolveInRoot(root, p);
          let content = readFileContent(abs).content;
          let total = 0;
          for (const e of edits) {
            const count = countOccurrences(content, e.oldString);
            if (count === 0) return { error: `oldString not found: "${e.oldString.slice(0, 50)}…"` };
            if (count > 1 && !e.replaceAll) return { error: `oldString not unique (${count}): "${e.oldString.slice(0, 50)}…"` };
            content = e.replaceAll ? content.split(e.oldString).join(e.newString) : content.replace(e.oldString, e.newString);
            total += e.replaceAll ? count : 1;
          }
          writeFileContent(abs, content);
          return { edited: true, path: relToRoot(root, abs), replacements: total };
        } catch (e) {
          return errResult(e);
        }
      },
    });
  }

  if (isToolAllowed("bash", level)) {
    toolset.bash = tool({
      description:
        "Run a shell command in the workspace root (real execution: pipes, &&, globs all work). Returns stdout/stderr/exit code.",
      inputSchema: z.object({
        command: z.string(),
        timeout: z.number().int().optional().describe("ms, default 120000, max 600000"),
      }),
      execute: async ({ command, timeout }, { abortSignal }) => {
        const guard = approvalGuard("bash", level);
        if (guard) return guard;
        return runBash({ command, root, timeoutMs: timeout, signal: abortSignal });
      },
    });
  }

  return toolset;
}

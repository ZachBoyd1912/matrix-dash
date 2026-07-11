import fs from "fs";
import os from "os";
import path from "path";

/**
 * Local filesystem operations the device performs on behalf of the dashboard's
 * workspace browser (P4 parity). The user browses THEIR OWN machine. Paths are
 * confined to the user's home directory unless an explicit root is configured,
 * so a compromised control plane can't read arbitrary disk via fs_op.
 */

const MAX_READ = 2_000_000; // 2MB text cap

function root(): string {
  return process.env.MATRIX_RUNNER_WORKSPACE || os.homedir();
}

function safeResolve(p: string): string {
  const base = root();
  const abs = path.resolve(base, p || ".");
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error("Path escapes the workspace root");
  }
  return abs;
}

export async function handleFsOp(
  op: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const p = typeof args.path === "string" ? args.path : "";
    switch (op) {
      case "list": {
        const dir = safeResolve(p);
        const entries = fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : "file",
        }));
        return { ok: true, data: { root: root(), path: p, entries } };
      }
      case "read": {
        const f = safeResolve(p);
        const stat = fs.statSync(f);
        if (stat.size > MAX_READ) return { ok: false, error: "File too large to preview" };
        return { ok: true, data: { content: fs.readFileSync(f, "utf8") } };
      }
      case "write": {
        const f = safeResolve(p);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, String(args.content ?? ""), "utf8");
        return { ok: true };
      }
      case "mkdir": {
        fs.mkdirSync(safeResolve(p), { recursive: true });
        return { ok: true };
      }
      case "rename": {
        const to = typeof args.to === "string" ? args.to : "";
        fs.renameSync(safeResolve(p), safeResolve(to));
        return { ok: true };
      }
      case "delete": {
        fs.rmSync(safeResolve(p), { recursive: true, force: true });
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown fs op: ${op}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

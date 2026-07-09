import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/utils/db-path";

/**
 * Before-copy safety net for non-repo (or dirty-repo) agent writes. Before an
 * agent modifies or creates a file that isn't protected by a git run branch, we
 * copy the prior version (or record that it was newly created) so the run is
 * fully reversible via /api/agents/runs/[runId]/undo.
 *
 * Layout: ~/MatrixDash/.agent-snapshots/<runId>/
 *   files/<encoded-abs-path>   – the pre-edit copy
 *   manifest.json              – { entries: [{ path, existed }] }
 */

interface ManifestEntry {
  path: string;
  existed: boolean;
}

interface Manifest {
  runId: string;
  entries: ManifestEntry[];
}

function snapshotRoot(): string {
  return path.join(getDataDir(), ".agent-snapshots");
}

function runDir(runId: string): string {
  return path.join(snapshotRoot(), runId);
}

function encodePath(abs: string): string {
  return encodeURIComponent(abs);
}

function loadManifest(runId: string): Manifest {
  const p = path.join(runDir(runId), "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
  } catch {
    return { runId, entries: [] };
  }
}

function saveManifest(runId: string, m: Manifest): void {
  fs.mkdirSync(runDir(runId), { recursive: true });
  fs.writeFileSync(path.join(runDir(runId), "manifest.json"), JSON.stringify(m, null, 2));
}

/** Record a before-copy for one target path (idempotent per run+path). */
export function beforeCopy(runId: string, absPath: string): void {
  const m = loadManifest(runId);
  if (m.entries.some((e) => e.path === absPath)) return; // first version already captured

  const existed = fs.existsSync(absPath);
  if (existed) {
    try {
      const dest = path.join(runDir(runId), "files", encodePath(absPath));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(absPath, dest);
    } catch {
      /* best-effort; still record so undo knows the file was touched */
    }
  }
  m.entries.push({ path: absPath, existed });
  saveManifest(runId, m);
  markRunSnapshotDir(runId);
}

/** Restore every before-copy for a run and delete files the run created. */
export function undoSnapshots(runId: string): { restored: number; deleted: number } {
  const m = loadManifest(runId);
  let restored = 0;
  let deleted = 0;
  for (const e of m.entries) {
    if (e.existed) {
      const src = path.join(runDir(runId), "files", encodePath(e.path));
      try {
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(e.path), { recursive: true });
          fs.copyFileSync(src, e.path);
          restored++;
        }
      } catch {
        /* skip */
      }
    } else {
      try {
        if (fs.existsSync(e.path)) {
          fs.rmSync(e.path);
          deleted++;
        }
      } catch {
        /* skip */
      }
    }
  }
  return { restored, deleted };
}

export function hasSnapshots(runId: string): boolean {
  return fs.existsSync(path.join(runDir(runId), "manifest.json"));
}

/** Prune snapshot dirs older than `days`. Called by the daemon heartbeat. */
export function pruneSnapshots(days: number): number {
  const root = snapshotRoot();
  if (!fs.existsSync(root)) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const entry of fs.readdirSync(root)) {
    const dir = path.join(root, entry);
    try {
      const stat = fs.statSync(dir);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
        pruned++;
      }
    } catch {
      /* skip */
    }
  }
  return pruned;
}

// The runner records snapshotDir on the run row so the undo route can find it.
function markRunSnapshotDir(runId: string): void {
  const g = globalThis as unknown as { __agentSnapshotDirs?: Set<string> };
  if (!g.__agentSnapshotDirs) g.__agentSnapshotDirs = new Set();
  g.__agentSnapshotDirs.add(runId);
}

export function snapshotDirFor(runId: string): string {
  return runDir(runId);
}

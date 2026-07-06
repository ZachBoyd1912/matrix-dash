import { spawn, exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const pexec = promisify(exec);

/* ------------------------------------------------------------------ *
 * Matrix Builder = the separate bolt.new fork (Remix + Vite) that the
 * /dashboard/matrix-builder page embeds. This service starts/stops its
 * dev server ON DEMAND so opening the tab "just works" without the user
 * having to launch `pnpm dev` in another terminal. We never modify that
 * app — we only run its existing `pnpm dev` from its own directory.
 *
 * Mirrors lib/services/code-server.ts (the IDE's on-demand lifecycle).
 * ------------------------------------------------------------------ */

const DEFAULT_PORT = 5001;
const DEFAULT_DIR = "/Users/zach/Desktop/bolt.new-custom";

/** Where a Homebrew / corepack / standalone install drops pnpm. */
const PNPM_CANDIDATES = [
  "/opt/homebrew/bin/pnpm",
  "/usr/local/bin/pnpm",
  path.join(os.homedir(), "Library", "pnpm", "pnpm"),
  path.join(os.homedir(), ".local", "share", "pnpm", "pnpm"),
];

export function builderDir(): string {
  return process.env.MATRIX_BUILDER_DIR || DEFAULT_DIR;
}

export function builderPort(): number {
  return parseInt(process.env.MATRIX_BUILDER_PORT || "", 10) || DEFAULT_PORT;
}

/** Public URL the iframe points at (overridable; defaults to localhost:PORT). */
export function builderUrl(): string {
  return process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL || `http://localhost:${builderPort()}`;
}

/** Loopback URL we probe from the server (always the local port, never a proxy). */
function probeUrl(): string {
  return `http://127.0.0.1:${builderPort()}`;
}

/** Absolute path to the builder dev server's captured stdout/stderr log. */
export function builderLogPath(): string {
  return path.join(os.homedir(), ".matrix-dash", "matrix-builder", "dev.log");
}

/** Read the last `maxBytes` of the dev log; returns text + the file's end offset. */
export function readBuilderLogTail(maxBytes = 64 * 1024): { text: string; offset: number } {
  const p = builderLogPath();
  let stat: fs.Stats;
  try {
    stat = fs.statSync(p);
  } catch {
    return { text: "", offset: 0 }; // not created until the builder first starts
  }
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  if (length <= 0) return { text: "", offset: stat.size };
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);
    return { text: buf.toString("utf8"), offset: stat.size };
  } finally {
    fs.closeSync(fd);
  }
}

/** Read bytes appended since `offset`; returns new text + the new end offset.
 *  If the file shrank (truncated/rotated), resets to read from the top. */
export function readBuilderLogSince(offset: number): {
  text: string;
  offset: number;
  reset: boolean;
} {
  const p = builderLogPath();
  let stat: fs.Stats;
  try {
    stat = fs.statSync(p);
  } catch {
    return { text: "", offset: 0, reset: offset !== 0 };
  }
  if (stat.size < offset) {
    // Truncated (e.g. Clear) — start over from the beginning.
    const fresh = readBuilderLogTail(stat.size);
    return { text: fresh.text, offset: stat.size, reset: true };
  }
  const length = stat.size - offset;
  if (length <= 0) return { text: "", offset: stat.size, reset: false };
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, offset);
    return { text: buf.toString("utf8"), offset: stat.size, reset: false };
  } finally {
    fs.closeSync(fd);
  }
}

/** Truncate the dev log (the "Clear" action). Best-effort. */
export function clearBuilderLog(): void {
  try {
    fs.writeFileSync(builderLogPath(), "");
  } catch {
    /* file may not exist yet — nothing to clear */
  }
}

/* ------------------------------------------------------------------ *
 * Detection / status
 * ------------------------------------------------------------------ */

async function resolvePnpm(): Promise<string | undefined> {
  try {
    const { stdout } = await pexec("command -v pnpm", { timeout: 4000 });
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    /* not on PATH — probe known locations below */
  }
  for (const candidate of PNPM_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

/** Any HTTP response on the port means the Vite dev server is listening. */
async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(probeUrl(), {
      signal: AbortSignal.timeout(3000),
      redirect: "manual",
    });
    return !!res;
  } catch {
    return false;
  }
}

/** PID currently listening on the builder port (informational + stop target). */
async function listenerPid(): Promise<number | undefined> {
  try {
    const { stdout } = await pexec(`lsof -nP -iTCP:${builderPort()} -sTCP:LISTEN -t`, {
      timeout: 4000,
    });
    const pid = parseInt(stdout.trim().split("\n")[0] ?? "", 10);
    return Number.isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

export interface MatrixBuilderStatus {
  running: boolean;
  port: number;
  url: string;
  dir: string;
  dirExists: boolean;
  pid?: number;
}

export async function builderStatus(): Promise<MatrixBuilderStatus> {
  const running = await isReachable();
  const dir = builderDir();
  let dirExists = false;
  try {
    dirExists = fs.statSync(dir).isDirectory();
  } catch {
    /* dir missing */
  }
  return {
    running,
    port: builderPort(),
    url: builderUrl(),
    dir,
    dirExists,
    pid: await listenerPid(),
  };
}

/* ------------------------------------------------------------------ *
 * Lifecycle (start / stop / restart)
 * ------------------------------------------------------------------ */

export async function startBuilder(): Promise<{ ok: boolean; error?: string }> {
  // Already up (ours or a manually-started instance)? No-op — opening the tab
  // should reuse whatever is already serving the port.
  if (await isReachable()) return { ok: true };

  const dir = builderDir();
  try {
    if (!fs.statSync(dir).isDirectory()) {
      return { ok: false, error: `Matrix Builder directory not found: ${dir}` };
    }
  } catch {
    return { ok: false, error: `Matrix Builder directory not found: ${dir}` };
  }

  const pnpm = await resolvePnpm();
  if (!pnpm) return { ok: false, error: "pnpm not found on PATH" };

  try {
    const logFile = builderLogPath();
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const out = fs.openSync(logFile, "a");

    // Strip PORT/HOST so the inherited `next dev` PORT=3000 can't override the
    // builder's own Vite config (strictPort :5001). The builder loads its own
    // .env.local (API keys) from its cwd via Vite, so cwd + a clean PATH is all
    // it needs from us.
    const childEnv = { ...process.env };
    delete childEnv.PORT;
    delete childEnv.HOST;
    delete childEnv.BIND_ADDR;

    // argv array (no shell) so nothing here is interpolated into a command.
    // detached + unref so the dev server outlives this request (and survives a
    // `next dev` reload) in its own process group.
    const child = spawn(pnpm, ["dev"], {
      cwd: dir,
      detached: true,
      stdio: ["ignore", out, out],
      env: childEnv,
    });
    child.unref();
    fs.closeSync(out);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopBuilder(): Promise<{ ok: boolean; error?: string }> {
  const pid = await listenerPid();
  if (!pid) return { ok: true }; // nothing listening — already stopped
  try {
    // Kill the whole process group (pnpm → remix → vite/esbuild children).
    let pgid = pid;
    try {
      const { stdout } = await pexec(`ps -o pgid= -p ${pid}`, { timeout: 3000 });
      const parsed = parseInt(stdout.trim(), 10);
      if (!Number.isNaN(parsed)) pgid = parsed;
    } catch {
      /* fall back to the bare pid below */
    }
    try {
      process.kill(-pgid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function restartBuilder(): Promise<{ ok: boolean; error?: string }> {
  await stopBuilder();
  await new Promise((r) => setTimeout(r, 1000));
  return startBuilder();
}

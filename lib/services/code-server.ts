import { spawn, exec, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { getSetting } from "@/lib/db/settings";

const pexec = promisify(exec);
const pexecFile = promisify(execFile);

const DEFAULT_PORT = 3010;

/** Common locations a Homebrew / npm / curl-installer drop the binary. */
const BIN_CANDIDATES = [
  "/opt/homebrew/bin/code-server",
  "/usr/local/bin/code-server",
  path.join(os.homedir(), ".local", "bin", "code-server"),
];

/* ------------------------------------------------------------------ *
 * Paths — everything we own lives under ~/.matrix-dash/code-server.
 * Scoping the user-data-dir here is what lets status/stop target ONLY
 * our process and never an unrelated code-server the user runs.
 * ------------------------------------------------------------------ */

export function dataDir(): string {
  return path.join(os.homedir(), ".matrix-dash", "code-server", "data");
}

export function extDir(): string {
  return path.join(os.homedir(), ".matrix-dash", "code-server", "extensions");
}

export function getIdePort(): number {
  return parseInt(getSetting("ideServerPort") || "", 10) || DEFAULT_PORT;
}

function ideUrl(port = getIdePort()): string {
  return `http://127.0.0.1:${port}`;
}

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

export interface CodeServerInstall {
  installed: boolean;
  version?: string;
  bin?: string;
}

/** Resolve the binary via `command -v`, falling back to well-known paths. */
async function resolveBin(): Promise<string | undefined> {
  try {
    const { stdout } = await pexec("command -v code-server", { timeout: 4000 });
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    /* not on PATH — probe known install locations below */
  }
  for (const candidate of BIN_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* candidate absent — keep looking */
    }
  }
  return undefined;
}

export async function detectCodeServer(): Promise<CodeServerInstall> {
  const bin = await resolveBin();
  if (!bin) return { installed: false };
  let version: string | undefined;
  try {
    // `code-server --version` prints e.g. "4.96.4 abc123 with Code 1.96.4";
    // we only want the first line's version token.
    const { stdout } = await pexec(`"${bin}" --version`, { timeout: 6000 });
    version = stdout.trim().split("\n")[0]?.trim() || undefined;
  } catch {
    /* binary present but version probe failed — still report installed */
  }
  return { installed: true, version, bin };
}

/* ------------------------------------------------------------------ *
 * Branded user settings
 * ------------------------------------------------------------------ */

/**
 * Ensure DATA_DIR/User/settings.json exists with matrix-dash branding.
 * Merge-safe: existing keys are preserved, ours are shallow-merged on top.
 */
export function writeBrandedSettings(): void {
  const userDir = path.join(dataDir(), "User");
  fs.mkdirSync(userDir, { recursive: true });
  const settingsPath = path.join(userDir, "settings.json");

  let existing: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
  } catch {
    /* missing or malformed — start from a clean object */
  }

  // Mirrors the emerald-on-#0a0a0a palette from components/ide/monaco-editor.tsx.
  const branded: Record<string, unknown> = {
    "workbench.colorCustomizations": {
      "editor.background": "#0a0a0a",
      "editor.foreground": "#e8e8e8",
      "editorLineNumber.foreground": "#555555",
      "editorLineNumber.activeForeground": "#888888",
      "editorCursor.foreground": "#34d399",
      "editor.selectionBackground": "#34d39933",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorIndentGuide.background": "#ffffff0a",
      "sideBar.background": "#0a0a0a",
      "activityBar.background": "#0a0a0a",
      "activityBar.foreground": "#34d399",
      "panel.background": "#0a0a0a",
      "statusBar.background": "#0a0a0a",
      "statusBar.foreground": "#34d399",
      "titleBar.activeBackground": "#0a0a0a",
      focusBorder: "#34d399",
    },
    "editor.fontFamily": "JetBrains Mono, monospace",
    "editor.fontLigatures": true,
    "telemetry.telemetryLevel": "off",
    "window.titleBarStyle": "custom",
    "workbench.startupEditor": "none",
  };

  const merged = { ...existing, ...branded };
  fs.writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

/* ------------------------------------------------------------------ *
 * Runtime status
 * ------------------------------------------------------------------ */

export interface CodeServerStatus {
  running: boolean;
  port: number;
  url: string;
  pid?: number;
  memMb?: number;
  cpu?: number;
  version?: string;
}

/** Healthz probe — code-server answers /healthz with `{ status, lastHeartbeat }`. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Best-effort process probe for OUR code-server (macOS/Linux). We match the
 * `.matrix-dash` user-data-dir so we never report on an unrelated code-server.
 */
export async function codeServerStatus(): Promise<CodeServerStatus> {
  const port = getIdePort();
  const url = ideUrl(port);
  const reachable = await isReachable(url);

  let proc: { pid?: number; memMb?: number; cpu?: number } = {};
  try {
    // ps columns: pid, %cpu, rss(KB), lstart; grep our scoped data dir.
    const { stdout } = await pexec(
      "ps -axo pid=,pcpu=,rss=,lstart= -ww | grep '[.]matrix-dash' | grep -i 'code-server' | head -1",
      { timeout: 4000 }
    );
    const line = stdout.trim();
    if (line) {
      const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+/);
      if (m) {
        proc = {
          pid: parseInt(m[1], 10),
          cpu: parseFloat(m[2]),
          memMb: Math.round(parseInt(m[3], 10) / 1024),
        };
      } else {
        const pid = parseInt(line.split(/\s+/)[0], 10);
        if (!Number.isNaN(pid)) proc.pid = pid;
      }
    }
  } catch {
    /* ps unavailable — fall back to reachability only */
  }

  let version: string | undefined;
  if (reachable || proc.pid !== undefined) {
    version = (await detectCodeServer()).version;
  }

  return { running: reachable || proc.pid !== undefined, port, url, version, ...proc };
}

/* ------------------------------------------------------------------ *
 * Lifecycle (start / stop / restart)
 * ------------------------------------------------------------------ */

/** Reject empty, relative, or null-byte-laced paths before touching the fs. */
function assertAbsoluteDir(p: string): string {
  if (!p.trim()) throw new Error("Folder path is required");
  if (p.includes("\0")) throw new Error("Invalid folder path");
  const resolved = path.resolve(p);
  if (!path.isAbsolute(resolved)) throw new Error("Folder path must be absolute");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error("Folder does not exist");
  }
  if (!stat.isDirectory()) throw new Error("Folder path is not a directory");
  return resolved;
}

/** Absolute path to the latest built matrix-agent .vsix, if one exists in the repo. */
function agentVsix(): string | undefined {
  // Next runs from the repo root, so the extension lives at a fixed relative path.
  const dir = path.join(process.cwd(), "vscode-extension", "matrix-agent");
  try {
    const vsix = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".vsix"))
      .sort();
    if (vsix.length) return path.join(dir, vsix[vsix.length - 1]); // newest by name
  } catch {
    /* extension not built yet — nothing to install */
  }
  return undefined;
}

/**
 * Install the matrix-agent extension into our scoped extensions dir, once, if it
 * has been built (a .vsix exists) and isn't already present. Best-effort: a
 * failure just means the agent sidebar won't appear, not that VS Code can't start.
 * Uses execFile (argv array, no shell) — all inputs are internally derived.
 */
async function ensureAgentExtension(bin: string): Promise<void> {
  try {
    const already = fs
      .readdirSync(extDir())
      .some((d) => d.toLowerCase().startsWith("matrix-dash.matrix-agent"));
    if (already) return;
  } catch {
    /* extensions dir doesn't exist yet — fall through and install */
  }
  const vsix = agentVsix();
  if (!vsix) return;
  try {
    await pexecFile(bin, ["--install-extension", vsix, "--extensions-dir", extDir()], {
      timeout: 60000,
    });
  } catch {
    /* best-effort install — leave the editor usable without the agent */
  }
}

export async function startCodeServer(folder?: string): Promise<{ ok: boolean; error?: string }> {
  // Already up? No-op so repeated "start" clicks are idempotent.
  if (await isReachable(ideUrl())) return { ok: true };

  let validatedFolder: string | undefined;
  if (folder !== undefined && folder !== "") {
    try {
      validatedFolder = assertAbsoluteDir(folder);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const { bin } = await detectCodeServer();
  if (!bin) return { ok: false, error: "code-server not installed" };

  writeBrandedSettings();
  await ensureAgentExtension(bin);

  // argv array only — never a shell string — so paths can't inject commands.
  const args = [
    "--bind-addr",
    `127.0.0.1:${getIdePort()}`,
    "--auth",
    "none",
    "--disable-telemetry",
    "--user-data-dir",
    dataDir(),
    "--extensions-dir",
    extDir(),
  ];
  if (validatedFolder) args.push(validatedFolder);

  try {
    // Log code-server's own stdout/stderr to a file so a failed start is
    // diagnosable. Previously stdio was "ignore", which made bind failures
    // (the process runs but never listens) completely invisible.
    const logPath = path.join(path.dirname(dataDir()), "code-server.log");
    const out = fs.openSync(logPath, "a");

    // Strip PORT/BIND_ADDR from the inherited env. Under `next dev`,
    // process.env.PORT is "3000", and code-server honors PORT over our
    // --bind-addr flag — so it would bind :3000 (colliding with the dashboard)
    // instead of :3010 and never become reachable. Hand it a cleaned env.
    const childEnv = { ...process.env };
    delete childEnv.PORT;
    delete childEnv.BIND_ADDR;

    const child = spawn(bin, args, {
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

export async function stopCodeServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    // Scope the kill to OUR data dir so we never touch an unrelated code-server.
    await pexec(`pkill -f "code-server.*\\.matrix-dash"`, { timeout: 4000 }).catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function restartCodeServer(folder?: string): Promise<{ ok: boolean; error?: string }> {
  await stopCodeServer();
  await new Promise((r) => setTimeout(r, 800));
  return startCodeServer(folder);
}

/* ------------------------------------------------------------------ *
 * Install
 * ------------------------------------------------------------------ */

export interface CodeServerInstallResult {
  installed: boolean;
  manual?: boolean;
  instruction?: string;
  error?: string;
}

/**
 * Run the official installer; on failure fall back to a manual brew instruction
 * (this machine is an arm64 Mac). Re-probes with detectCodeServer() either way.
 */
export async function installCodeServer(): Promise<CodeServerInstallResult> {
  try {
    await pexec("curl -fsSL https://code-server.dev/install.sh | sh", {
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 16,
    });
    const probe = await detectCodeServer();
    return { installed: probe.installed };
  } catch (err) {
    const probe = await detectCodeServer();
    if (probe.installed) return { installed: true };
    return {
      installed: false,
      manual: true,
      instruction: "brew install code-server",
      error: err instanceof Error ? err.message.split("\n").slice(-4).join("\n") : String(err),
    };
  }
}

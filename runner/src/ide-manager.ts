import { spawn, execFileSync, type ChildProcess } from "child_process";
import net from "net";

/**
 * Manages a local code-server (VS Code in the browser) on the device (P4 IDE
 * parity). code-server binds to 127.0.0.1 on the user's OWN machine; their
 * browser is on that same machine, so the dashboard just tells the runner to
 * start it and opens the returned localhost URL in a new tab. Auth is `none`
 * because the socket is loopback-only on the user's own device.
 *
 * If code-server isn't installed, we report needsInstall with a hint rather
 * than trying to download it here — auto-install is a follow-on (per-platform).
 */

interface IdeState {
  proc: ChildProcess | null;
  port: number | null;
}

const KEY = Symbol.for("matrix-runner.ide");
function state(): IdeState {
  const g = globalThis as unknown as Record<symbol, IdeState | undefined>;
  if (!g[KEY]) g[KEY] = { proc: null, port: null };
  return g[KEY]!;
}

function isInstalled(): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["code-server"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export interface IdeResult {
  ok: boolean;
  running?: boolean;
  url?: string;
  port?: number;
  needsInstall?: boolean;
  installHint?: string;
  error?: string;
}

export async function handleIde(action: string): Promise<IdeResult> {
  const s = state();
  if (action === "status") {
    return s.proc && s.port
      ? { ok: true, running: true, url: `http://127.0.0.1:${s.port}/`, port: s.port }
      : { ok: true, running: false };
  }

  if (action === "stop") {
    if (s.proc) {
      try {
        s.proc.kill();
      } catch {
        /* already gone */
      }
    }
    s.proc = null;
    s.port = null;
    return { ok: true, running: false };
  }

  if (action === "start") {
    if (s.proc && s.port) {
      return { ok: true, running: true, url: `http://127.0.0.1:${s.port}/`, port: s.port };
    }
    if (!isInstalled()) {
      return {
        ok: false,
        needsInstall: true,
        installHint:
          "Install code-server: https://coder.com/docs/code-server (curl -fsSL https://code-server.dev/install.sh | sh)",
      };
    }
    try {
      const port = await freePort();
      const proc = spawn(
        "code-server",
        ["--bind-addr", `127.0.0.1:${port}`, "--auth", "none", "--disable-telemetry"],
        { stdio: "ignore", detached: false }
      );
      proc.on("exit", () => {
        const cur = state();
        if (cur.proc === proc) {
          cur.proc = null;
          cur.port = null;
        }
      });
      s.proc = proc;
      s.port = port;
      // Give it a moment to bind before the client opens the URL.
      await new Promise((r) => setTimeout(r, 800));
      return { ok: true, running: true, url: `http://127.0.0.1:${port}/`, port };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, error: `Unknown IDE action: ${action}` };
}

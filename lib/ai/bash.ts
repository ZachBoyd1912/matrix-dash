import { spawn } from "child_process";

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
}

const HEAD = 30_000;
const TAIL = 10_000;

function clip(s: string): { text: string; truncated: boolean } {
  if (s.length <= HEAD + TAIL) return { text: s, truncated: false };
  return {
    text: `${s.slice(0, HEAD)}\n\n…[${s.length - HEAD - TAIL} bytes elided]…\n\n${s.slice(-TAIL)}`,
    truncated: true,
  };
}

/**
 * Run a real shell command inside the workspace root. Uses spawn (not execFile/exec)
 * with `shell:true` so pipes/&&/globs work like Claude Code's Bash, and `detached:true`
 * so we can kill the whole process group on timeout/abort (execFile's timeout leaks
 * grandchildren). Output is head+tail truncated to protect the 8 GB box.
 */
export function runBash(opts: {
  command: string;
  root: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
}): Promise<BashResult> {
  const { command, root, signal, onChunk } = opts;
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 120_000, 1_000), 600_000);
  const startedAt = Date.now();

  return new Promise<BashResult>((resolve) => {
    const env = { ...process.env };
    delete env.PORT;
    delete env.BIND_ADDR; // mirror code-server.ts: avoid leaking the dashboard's bind config

    const child = spawn(command, { shell: true, cwd: root, detached: true, env });

    let out = "";
    let err = "";
    let timedOut = false;
    let settled = false;

    const kill = (sig: NodeJS.Signals) => {
      try {
        if (child.pid != null) process.kill(-child.pid, sig);
      } catch {
        /* group already gone */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), 2_000);
    }, timeoutMs);

    const onAbort = () => kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      out += s;
      onChunk?.("stdout", s);
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      err += s;
      onChunk?.("stderr", s);
    });

    const finish = (code: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const co = clip(out);
      const ce = clip(err);
      resolve({
        stdout: co.text,
        stderr: ce.text,
        exitCode: code,
        signal: sig,
        durationMs: Date.now() - startedAt,
        truncated: co.truncated || ce.truncated,
        timedOut,
      });
    };

    child.on("error", () => finish(null, null));
    child.on("close", (code, sig) => finish(code, sig));
  });
}

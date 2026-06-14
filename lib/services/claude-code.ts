import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getSetting } from "@/lib/db/settings";
import { getWorkspaceRoot, getPowerLevel, type PowerLevel } from "@/lib/ai/power";
import { getActiveProvider } from "@/lib/ai/registry";
import type { StreamEvent } from "@/lib/chat/blocks";

/**
 * Wrapper around the REAL Claude Code CLI. Spawns `claude -p … --output-format
 * stream-json` headlessly, optionally routed through claude-code-router (set
 * `claude_code_base_url` → ANTHROPIC_BASE_URL) so it uses any provider key, and maps
 * its stream-json events onto Matrix's Block protocol. Mirrors ollama.ts/code-server.ts.
 */

export interface ClaudeStatus {
  installed: boolean;
  bin: string | null;
  version: string | null;
  baseUrl: string | null;
}

/** Locate the `claude` binary: explicit setting → common install paths → PATH. */
function findClaudeBin(): string {
  const override = getSetting("claude_code_bin")?.trim();
  if (override) return override;
  const home = os.homedir();
  const candidates = [
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    path.join(home, ".local/bin/claude"),
    path.join(home, ".npm-global/bin/claude"),
    path.join(home, ".bun/bin/claude"),
    path.join(home, "node_modules/.bin/claude"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "claude"; // fall back to PATH resolution
}

/**
 * Auto-wire credentials so the user configures nothing: ALWAYS route Claude Code
 * through Matrix's own built-in Anthropic-compatible proxy, which runs the user's
 * ACTIVE Matrix provider and selected model — so Claude Code uses whatever model is
 * picked in Matrix, regardless of provider. Nothing to configure.
 */
function autoCredentials(matrixOrigin?: string): { env: Record<string, string>; model?: string } {
  const overrideUrl = getSetting("claude_code_base_url")?.trim();
  const active = getActiveProvider();
  const base = overrideUrl || (matrixOrigin ? `${matrixOrigin}/api/ai/proxy` : "");
  const env: Record<string, string> = { ANTHROPIC_API_KEY: "matrix" };
  if (base) env.ANTHROPIC_BASE_URL = base;
  // Pass the Matrix model id along (via Claude Code's --model) so the proxy can run
  // exactly the model selected in Matrix; the proxy falls back to the provider default.
  return { env, model: active?.defaultModel ?? undefined };
}

/** Detect whether the `claude` CLI is available. */
export function detectClaude(): Promise<ClaudeStatus> {
  const bin = findClaudeBin();
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000 }, (err, stdout) => {
      if (err) resolve({ installed: false, bin: null, version: null, baseUrl: null });
      else resolve({ installed: true, bin, version: String(stdout).trim().slice(0, 80), baseUrl: null });
    });
  });
}

/** Map the Matrix power level onto Claude Code's permission flags. */
function permissionArgs(level: PowerLevel): string[] {
  if (level === "unrestricted") return ["--dangerously-skip-permissions"];
  if (level === "sandboxed") return ["--permission-mode", "plan"];
  return ["--permission-mode", "acceptEdits"]; // approval (interim: auto-accept edits)
}

// Resume map: Matrix sessionId → Claude Code session_id (single-process).
const g = globalThis as unknown as { __ccSessions?: Map<string, string> };
const ccSessions: Map<string, string> = (g.__ccSessions ??= new Map());

interface CCEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: unknown;
  message?: { content?: Array<Record<string, unknown>> };
}

function mapEvent(ev: CCEvent, emit: (e: StreamEvent) => void, matrixSessionId?: string) {
  if (!ev || typeof ev !== "object") return;
  if (ev.type === "system" && ev.subtype === "init") {
    if (matrixSessionId && typeof ev.session_id === "string") ccSessions.set(matrixSessionId, ev.session_id);
    return;
  }
  if (ev.type === "assistant" && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === "text" && typeof c.text === "string") emit({ type: "text", value: c.text });
      else if (c.type === "tool_use")
        emit({ type: "tool_call", id: String(c.id), name: String(c.name), args: c.input });
    }
    return;
  }
  if (ev.type === "user" && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === "tool_result") {
        const text = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
        emit({ type: "tool_result", id: String(c.tool_use_id), result: text, error: c.is_error ? text : undefined });
      }
    }
    return;
  }
  if (ev.type === "result") {
    if (matrixSessionId && typeof ev.session_id === "string") ccSessions.set(matrixSessionId, ev.session_id);
    if (ev.is_error && ev.result) emit({ type: "error", value: String(ev.result) });
  }
}

/** Run one Claude Code turn, streaming its events through `emit`. */
export function runClaudeTurn(opts: {
  prompt: string;
  matrixSessionId?: string;
  matrixOrigin?: string;
  model?: string;
  signal?: AbortSignal;
  emit: (ev: StreamEvent) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const { prompt, matrixSessionId, matrixOrigin, signal, emit } = opts;
  const bin = findClaudeBin();
  const root = getWorkspaceRoot();
  const resume = matrixSessionId ? ccSessions.get(matrixSessionId) : undefined;
  const creds = autoCredentials(matrixOrigin);

  // We deliberately DON'T pass --model: Claude Code always sends its own Claude model
  // id to the proxy, which Matrix ignores in favour of the active provider/model.
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", ...permissionArgs(getPowerLevel())];
  if (resume) args.push("--resume", resume);

  const env = { ...process.env, ...creds.env };

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { cwd: root, env });
    } catch (e) {
      emit({ type: "error", value: `Failed to start Claude Code: ${e instanceof Error ? e.message : String(e)}` });
      return resolve({ ok: false, error: "spawn failed" });
    }
    const onAbort = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    let buf = "";
    let errBuf = "";
    const handleLine = (s: string) => {
      const t = s.trim();
      if (!t) return;
      try {
        mapEvent(JSON.parse(t) as CCEvent, emit, matrixSessionId);
      } catch {
        /* ignore non-JSON noise */
      }
    };
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) handleLine(l);
    });
    child.stderr?.on("data", (d: Buffer) => {
      errBuf += d.toString("utf8");
    });
    child.on("error", (e) => {
      signal?.removeEventListener("abort", onAbort);
      emit({ type: "error", value: `Claude Code error: ${e.message}` });
      resolve({ ok: false, error: e.message });
    });
    child.on("close", (code) => {
      if (buf.trim()) handleLine(buf);
      signal?.removeEventListener("abort", onAbort);
      if (code && code !== 0) {
        emit({ type: "error", value: errBuf.trim().slice(0, 600) || `Claude Code exited ${code}` });
        resolve({ ok: false, error: `exit ${code}` });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

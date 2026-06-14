import { spawn, execFile } from "child_process";
import { getSetting } from "@/lib/db/settings";
import { getWorkspaceRoot, getPowerLevel, type PowerLevel } from "@/lib/ai/power";
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

function binPath(): string {
  return getSetting("claude_code_bin")?.trim() || "claude";
}

/** Detect whether the `claude` CLI is available (and the configured router URL). */
export function detectClaude(): Promise<ClaudeStatus> {
  const bin = binPath();
  const baseUrl = getSetting("claude_code_base_url")?.trim() || null;
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000 }, (err, stdout) => {
      if (err) resolve({ installed: false, bin: null, version: null, baseUrl });
      else resolve({ installed: true, bin, version: String(stdout).trim().slice(0, 80), baseUrl });
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
  model?: string;
  signal?: AbortSignal;
  emit: (ev: StreamEvent) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const { prompt, matrixSessionId, model, signal, emit } = opts;
  const bin = binPath();
  const root = getWorkspaceRoot();
  const baseUrl = getSetting("claude_code_base_url")?.trim();
  const resume = matrixSessionId ? ccSessions.get(matrixSessionId) : undefined;

  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", ...permissionArgs(getPowerLevel())];
  if (model) args.push("--model", model);
  if (resume) args.push("--resume", resume);

  const env = { ...process.env };
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

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

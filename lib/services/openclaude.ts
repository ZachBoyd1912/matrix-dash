import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getSetting } from "@/lib/db/settings";
import { getWorkspaceRoot, getPowerLevel, type PowerLevel } from "@/lib/ai/power";
import { getActiveProvider, type ProviderRecord } from "@/lib/ai/registry";
import { decrypt } from "@/lib/utils/crypto";
import { providerSpec, DEFAULT_MODELS } from "@/types/ai-provider";
import type { StreamEvent } from "@/lib/chat/blocks";

/**
 * Wraps OpenClaude (github.com/Gitlawb/openclaude) — a provider-agnostic Claude Code
 * fork. Same headless CLI (`-p --output-format stream-json`) and event shape, but it
 * talks to ANY provider natively via OpenAI-compatible env, so the chat runs the
 * active Matrix provider/model directly — no Anthropic proxy. Mirrors ollama.ts.
 */

export interface OpenClaudeStatus {
  installed: boolean;
  bin: string | null;
  version: string | null;
}

function findBin(): string {
  const override = getSetting("openclaude_bin")?.trim();
  if (override) return override;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".npm/bin/openclaude"),
    "/usr/local/bin/openclaude",
    "/opt/homebrew/bin/openclaude",
    path.join(home, ".local/bin/openclaude"),
    path.join(home, ".npm-global/bin/openclaude"),
    path.join(home, ".bun/bin/openclaude"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "openclaude";
}

export function detectOpenClaude(): Promise<OpenClaudeStatus> {
  const bin = findBin();
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000 }, (err, stdout) => {
      if (err) resolve({ installed: false, bin: null, version: null });
      else resolve({ installed: true, bin, version: String(stdout).trim().slice(0, 80) });
    });
  });
}

/** Map the active Matrix provider to OpenClaude's provider env (OpenAI-compatible, etc.). */
function providerEnv(p: ProviderRecord): Record<string, string> {
  const key = decrypt(p.apiKeyEncrypted);
  const model = p.defaultModel || DEFAULT_MODELS[p.provider] || "";
  const spec = providerSpec(p.provider);
  const sdk = spec?.sdk ?? "openai-compat";
  if (sdk === "google")
    return { CLAUDE_CODE_USE_GEMINI: "1", GEMINI_API_KEY: key, GEMINI_MODEL: model };
  if (sdk === "anthropic") return { ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: model };
  // openai-compat / mistral / xai → OpenAI-compatible endpoint. CLAUDE_CODE_USE_OPENAI
  // selects this provider instead of OpenClaude's default Opengateway.
  const baseURL = p.baseUrl || spec?.baseUrl || "https://api.openai.com/v1";
  return {
    CLAUDE_CODE_USE_OPENAI: "1",
    OPENAI_BASE_URL: baseURL,
    OPENAI_API_KEY: key,
    OPENAI_MODEL: model,
  };
}

function permissionArgs(level: PowerLevel): string[] {
  if (level === "unrestricted") return ["--dangerously-skip-permissions"];
  if (level === "sandboxed") return ["--permission-mode", "plan"];
  return ["--permission-mode", "acceptEdits"];
}

// Resume map: Matrix sessionId → OpenClaude session_id (single self-hosted process).
const g = globalThis as unknown as { __ocSessions?: Map<string, string> };
const ocSessions: Map<string, string> = (g.__ocSessions ??= new Map());

interface OCEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: unknown;
  message?: { content?: Array<Record<string, unknown>> };
}

function mapEvent(ev: OCEvent, emit: (e: StreamEvent) => void, sid?: string) {
  if (!ev || typeof ev !== "object") return;
  if (ev.type === "system" && ev.subtype === "init") {
    if (sid && typeof ev.session_id === "string") ocSessions.set(sid, ev.session_id);
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
        emit({
          type: "tool_result",
          id: String(c.tool_use_id),
          result: text,
          error: c.is_error ? text : undefined,
        });
      }
    }
    return;
  }
  if (ev.type === "result") {
    if (sid && typeof ev.session_id === "string") ocSessions.set(sid, ev.session_id);
    if (ev.is_error && ev.result) emit({ type: "error", value: String(ev.result) });
  }
}

/** Run one OpenClaude turn on the active Matrix provider, streaming its events. */
export function runOpenClaudeTurn(opts: {
  prompt: string;
  matrixSessionId?: string;
  signal?: AbortSignal;
  emit: (ev: StreamEvent) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const { prompt, matrixSessionId, signal, emit } = opts;
  const provider = getActiveProvider();
  if (!provider) {
    emit({ type: "error", value: "No active Matrix provider. Add one in Settings → Add Models." });
    return Promise.resolve({ ok: false, error: "no provider" });
  }
  const bin = findBin();
  const root = getWorkspaceRoot();
  const resume = matrixSessionId ? ocSessions.get(matrixSessionId) : undefined;
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    ...permissionArgs(getPowerLevel()),
  ];
  if (resume) args.push("--resume", resume);
  const env = { ...process.env, ...providerEnv(provider) };

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { cwd: root, env });
    } catch (e) {
      emit({
        type: "error",
        value: `Failed to start OpenClaude: ${e instanceof Error ? e.message : String(e)}`,
      });
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
        mapEvent(JSON.parse(t) as OCEvent, emit, matrixSessionId);
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
      emit({ type: "error", value: `OpenClaude error: ${e.message}` });
      resolve({ ok: false, error: e.message });
    });
    child.on("close", (code) => {
      if (buf.trim()) handleLine(buf);
      signal?.removeEventListener("abort", onAbort);
      if (code && code !== 0) {
        emit({ type: "error", value: errBuf.trim().slice(0, 600) || `OpenClaude exited ${code}` });
        resolve({ ok: false, error: `exit ${code}` });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

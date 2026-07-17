import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getSetting } from "@/lib/db/settings";
import { getSqlite } from "@/lib/db/client";
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
 * Per-process shared secret authenticating the CLI subprocess to Matrix's own
 * Anthropic-compatible proxy. The proxy path is exempt from the session-cookie
 * gate (the CLI can't carry a cookie), so this secret — sent as the CLI's
 * ANTHROPIC_API_KEY, arriving as x-api-key — is what stops the proxy from
 * being an open relay that burns the owner's provider keys.
 */
const secretG = globalThis as unknown as { __ccProxySecret?: string };
export function getClaudeProxySecret(): string {
  // Env override for multi-process setups (or out-of-process testing) where
  // the spawner and the proxy route don't share one globalThis.
  const fixed = process.env.MATRIX_CC_PROXY_SECRET?.trim();
  if (fixed) return fixed;
  return (secretG.__ccProxySecret ??= crypto.randomUUID() + crypto.randomUUID());
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
  const env: Record<string, string> = { ANTHROPIC_API_KEY: getClaudeProxySecret() };
  if (base) env.ANTHROPIC_BASE_URL = base;
  // Pass the Matrix model id along (via Claude Code's --model) so the proxy can run
  // exactly the model selected in Matrix; the proxy falls back to the provider default.
  return { env, model: active?.defaultModel ?? undefined };
}

/** Subscription (Pro/Max) OAuth-token auth: mark to scrub proxy/api-key env. */
function subscriptionCredentials(token: string): {
  env: Record<string, string>;
  scrub: true;
  model?: string;
} {
  return { env: { CLAUDE_CODE_OAUTH_TOKEN: token }, scrub: true };
}

/** Detect whether the `claude` CLI is available. */
export function detectClaude(): Promise<ClaudeStatus> {
  const bin = findClaudeBin();
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000 }, (err, stdout) => {
      if (err) resolve({ installed: false, bin: null, version: null, baseUrl: null });
      else
        resolve({
          installed: true,
          bin,
          version: String(stdout).trim().slice(0, 80),
          baseUrl: null,
        });
    });
  });
}

/** Map the Matrix power level onto Claude Code's permission flags. */
function permissionArgs(level: PowerLevel): string[] {
  if (level === "unrestricted") return ["--dangerously-skip-permissions"];
  if (level === "sandboxed") return ["--permission-mode", "plan"];
  return ["--permission-mode", "acceptEdits"]; // approval (interim: auto-accept edits)
}

// Resume map: Matrix sessionId → Claude Code session_id. In-memory cache over
// the durable sessions.cc_session_id column (survives restarts via the DB).
const g = globalThis as unknown as { __ccSessions?: Map<string, string> };
const ccSessions: Map<string, string> = (g.__ccSessions ??= new Map());

/** Durable resume state: read cc_session_id + fork flag from the sessions row. */
function loadCcState(matrixSessionId: string): { ccId: string | null; forkPending: boolean } {
  const cached = ccSessions.get(matrixSessionId);
  try {
    const row = getSqlite()
      .prepare("SELECT cc_session_id AS c, cc_fork_pending AS f FROM sessions WHERE id = ?")
      .get(matrixSessionId) as { c: string | null; f: number } | undefined;
    return { ccId: cached ?? row?.c ?? null, forkPending: !!row?.f };
  } catch {
    return { ccId: cached ?? null, forkPending: false };
  }
}

function saveCcSessionId(matrixSessionId: string, ccId: string) {
  ccSessions.set(matrixSessionId, ccId);
  try {
    getSqlite()
      .prepare("UPDATE sessions SET cc_session_id = ?, cc_fork_pending = 0 WHERE id = ?")
      .run(ccId, matrixSessionId);
  } catch {
    /* best-effort — in-memory map still covers this process */
  }
}

interface CCEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: unknown;
  parent_tool_use_id?: string | null;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; thinking?: string };
  };
  message?: { content?: Array<Record<string, unknown>> };
}

/** Per-turn stream state: whether the current message already streamed deltas. */
interface TurnState {
  sawDelta: boolean;
}

function mapEvent(
  ev: CCEvent,
  emit: (e: StreamEvent) => void,
  matrixSessionId?: string,
  state?: TurnState
) {
  if (!ev || typeof ev !== "object") return;
  // Subagent attribution: the CLI tags every event raised inside a Task
  // (subagent) run with parent_tool_use_id — thread it through so the UI can
  // nest the subagent's work under its Task card.
  const parentId = typeof ev.parent_tool_use_id === "string" ? ev.parent_tool_use_id : undefined;
  if (ev.type === "system" && ev.subtype === "init") {
    if (matrixSessionId && typeof ev.session_id === "string")
      saveCcSessionId(matrixSessionId, ev.session_id);
    return;
  }
  if (ev.type === "stream_event" && !parentId) {
    // New message starting: reset the delta marker so the next whole-message
    // fallback decision is per-message, not per-turn.
    if (ev.event?.type === "message_start" && state) state.sawDelta = false;
    // --include-partial-messages: live text/thinking deltas. Only stream
    // TOP-LEVEL deltas; subagent text arrives summarized in its Task result.
    if (ev.event?.type === "content_block_delta") {
      const d = ev.event.delta;
      if (d?.type === "text_delta" && d.text) {
        if (state) state.sawDelta = true;
        emit({ type: "text", value: d.text });
      } else if (d?.type === "thinking_delta" && d.thinking) {
        if (state) state.sawDelta = true;
        emit({ type: "reasoning", value: d.thinking });
      }
    }
    return;
  }
  if (ev.type === "assistant" && ev.message?.content) {
    for (const c of ev.message.content) {
      // Whole-message text: emitted only when no deltas streamed this message
      // (delta emission is not guaranteed on every path — resumed sessions
      // have arrived delta-less). Deltas seen → skip the duplicate. Subagent
      // whole-messages stay skipped (rendered via their Task card).
      if (c.type === "text" && typeof c.text === "string" && !parentId && state && !state.sawDelta)
        emit({ type: "text", value: c.text });
      if (c.type === "tool_use")
        emit({
          type: "tool_call",
          id: String(c.id),
          name: String(c.name),
          args: c.input,
          parentId,
        });
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
          parentId,
        });
      }
    }
    return;
  }
  if (ev.type === "result") {
    if (matrixSessionId && typeof ev.session_id === "string")
      saveCcSessionId(matrixSessionId, ev.session_id);
    if (ev.is_error && ev.result) emit({ type: "error", value: String(ev.result) });
  }
}

/**
 * Build --mcp-config args from the `claude_code_mcp_servers` setting (JSON
 * object: name → {command,args,env} or {url}). Written to a temp file per turn
 * because the CLI takes file paths, not inline JSON.
 */
function mcpConfigArgs(): string[] {
  const raw = getSetting("claude_code_mcp_servers")?.trim();
  if (!raw) return [];
  try {
    const servers = JSON.parse(raw) as Record<string, unknown>;
    if (!servers || typeof servers !== "object" || Object.keys(servers).length === 0) return [];
    const file = path.join(os.tmpdir(), `matrix-cc-mcp-${process.pid}.json`);
    fs.writeFileSync(file, JSON.stringify({ mcpServers: servers }), { mode: 0o600 });
    return ["--mcp-config", file];
  } catch {
    return []; // malformed JSON — surfaced by the settings UI validator, not here
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
  /** When set, authenticate with the user's Claude subscription OAuth token
   * (chat-via-subscription) instead of the Matrix proxy — the env is scrubbed of
   * any ANTHROPIC_* API-key/proxy overrides so the token authenticates cleanly. */
  oauthToken?: string;
  /** Explicit plan-mode toggle from the chat UI — overrides the power-level
   * mapping with --permission-mode plan for this turn. */
  planMode?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { prompt, matrixSessionId, matrixOrigin, signal, emit, oauthToken, planMode } = opts;
  const bin = findClaudeBin();
  const root = getWorkspaceRoot();
  const cc = matrixSessionId
    ? loadCcState(matrixSessionId)
    : { ccId: null as string | null, forkPending: false };
  const creds = oauthToken ? subscriptionCredentials(oauthToken) : autoCredentials(matrixOrigin);

  // We deliberately DON'T pass --model: Claude Code always sends its own Claude model
  // id to the proxy, which Matrix ignores in favour of the active provider/model.
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    // Live text/thinking deltas so the UI streams like the real terminal
    // instead of dropping whole paragraphs at once.
    "--include-partial-messages",
    ...(planMode ? ["--permission-mode", "plan"] : permissionArgs(getPowerLevel())),
    ...mcpConfigArgs(),
  ];
  if (cc.ccId) {
    args.push("--resume", cc.ccId);
    // A forked Matrix session resumes the parent's CLI session ONCE with
    // --fork-session, so the CLI mints a fresh session id and the parent's
    // CLI history is never advanced by the fork's turns.
    if (cc.forkPending) args.push("--fork-session");
  }

  // Subscription path: start from a scrubbed env (drop any inherited Anthropic
  // API-key/proxy overrides) so the OAuth token authenticates cleanly.
  const baseEnv = { ...process.env };
  if ("scrub" in creds && creds.scrub) {
    delete baseEnv.ANTHROPIC_API_KEY;
    delete baseEnv.ANTHROPIC_AUTH_TOKEN;
    delete baseEnv.ANTHROPIC_BASE_URL;
  }
  const env = { ...baseEnv, ...creds.env };

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { cwd: root, env });
    } catch (e) {
      emit({
        type: "error",
        value: `Failed to start Claude Code: ${e instanceof Error ? e.message : String(e)}`,
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
    const turnState: TurnState = { sawDelta: false };
    const handleLine = (s: string) => {
      const t = s.trim();
      if (!t) return;
      try {
        mapEvent(JSON.parse(t) as CCEvent, emit, matrixSessionId, turnState);
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

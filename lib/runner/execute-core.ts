import { randomUUID } from "crypto";
import { evaluatePolicy } from "@/lib/ai/agent-policy";
import type { StreamEvent } from "@/lib/chat/blocks";
import type { AgentConfig } from "@/types/agents";

/* ------------------------------------------------------------------ *
 * Device-side agent execution engine. Runs on the runner, against the
 * user's OWN filesystem, with the SAME policy engine as the server.
 * Everything that would touch server state is injected (RunSink events,
 * approval bridge, server-tool RPC, the SDK query itself) so this module
 * is bundle-safe (pure agent-policy + isomorphic blocks) AND testable
 * with a fake SDK — mirroring the server-legacy executeRun, which stays
 * untouched.
 * ------------------------------------------------------------------ */

// Minimal shapes of what we consume from the SDK — kept local so the runner
// bundle needn't type-depend on the SDK (it's dynamically required at runtime).
export interface SdkMessageLike {
  type: string;
  subtype?: string;
  session_id?: string;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: { content?: unknown[]; usage?: { input_tokens?: number; output_tokens?: number } };
}

export type PermissionResultLike =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export interface QueryOptions {
  prompt: string;
  options: Record<string, unknown>;
}
export type QueryFn = (opts: QueryOptions) => AsyncIterable<SdkMessageLike>;

export interface ExecuteDeps {
  query: QueryFn;
  /** Fan transcript events back to the server (batched by the caller). */
  emit: (ev: StreamEvent) => void;
  /** Report final usage/cost. */
  reportUsage: (u: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    numTurns: number;
  }) => void;
  /**
   * Ask the server for a gated/break-glass decision. Resolves true=approved,
   * false=denied. The caller implements this as an approval_request frame plus
   * durable polling of /api/runner/approvals (survives reconnects).
   */
  requestApproval: (req: {
    approvalId: string;
    toolName: string;
    input: Record<string, unknown>;
    summary: string;
    tier: "gated" | "break_glass";
    justification?: string;
  }) => Promise<boolean>;
  /** Proxy the 3 account-state agent tools to the server. */
  callServerTool: (tool: string, args: Record<string, unknown>) => Promise<string>;
  /** Policy config paths (device-local). */
  policyPaths: { selfPaths: string[]; dbPaths: string[]; extraDenylist: string[] };
  maxChainDepthDefault: number;
  abortSignal: AbortSignal;
  /** The user's own Claude subscription OAuth token — injected into the SDK env
   * (memory-only) so the run bills to their usage. Falls back to the device's
   * ambient login when absent. */
  claudeToken?: string;
}

/** Scrubbed SDK env: drop any Anthropic API-key/proxy overrides so the
 * subscription token (or the device's own login) authenticates cleanly. */
function sdkEnv(claudeToken?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN" || k === "ANTHROPIC_BASE_URL")
      continue;
    if (typeof v === "string") env[k] = v;
  }
  if (claudeToken) env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;
  return env;
}

export interface ExecuteResult {
  status: string; // succeeded|failed|cancelled|timeout
  error: string | null;
  result: string;
}

function mapMessage(
  msg: SdkMessageLike,
  emit: (ev: StreamEvent) => void,
  onSession: (id: string) => void
): void {
  if (msg.type === "system" && msg.subtype === "init") {
    if (msg.session_id) onSession(msg.session_id);
    return;
  }
  if (msg.type === "assistant") {
    for (const block of (msg.message?.content ?? []) as Array<Record<string, unknown>>) {
      const t = block.type as string;
      if (t === "text" && typeof block.text === "string") emit({ type: "text", value: block.text });
      else if (t === "thinking" && typeof block.thinking === "string")
        emit({ type: "reasoning", value: block.thinking });
      else if (t === "tool_use")
        emit({
          type: "tool_call",
          id: String(block.id ?? randomUUID()),
          name: String(block.name ?? "tool"),
          args: block.input,
        });
    }
    return;
  }
  if (msg.type === "user") {
    for (const block of (msg.message?.content ?? []) as Array<Record<string, unknown>>) {
      if (block.type === "tool_result") {
        const isError = block.is_error === true;
        emit({
          type: "tool_result",
          id: String(block.tool_use_id ?? ""),
          result: isError ? undefined : block.content,
          error: isError ? String(block.content ?? "error") : undefined,
        });
      }
    }
  }
}

/** Execute one agent run on the device. Returns the terminal status. */
export async function executeAgentRun(
  agent: AgentConfig,
  prompt: string,
  runId: string,
  deps: ExecuteDeps
): Promise<ExecuteResult> {
  let lastTextBlock = "";
  let cancelled = false;

  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResultLike> => {
    const verdict = evaluatePolicy({
      toolName,
      input,
      writeAllowlist: agent.writeAllowlist,
      learnedRules: agent.learnedRules,
      maxChainDepth: agent.maxChainDepth,
      dryRun: false,
      chainDepth: 0,
      selfPaths: deps.policyPaths.selfPaths,
      dbPaths: deps.policyPaths.dbPaths,
      extraDenylist: deps.policyPaths.extraDenylist,
      maxChainDepthDefault: deps.maxChainDepthDefault,
    });
    switch (verdict.decision) {
      case "auto_allow":
      case "redact":
        return { behavior: "allow", updatedInput: input };
      case "hard_deny":
        return { behavior: "deny", message: `Denied (no override): ${verdict.reason}` };
      case "simulate":
        return { behavior: "deny", message: `Dry run: ${toolName} simulated.` };
      case "queue":
      case "break_glass": {
        const approved = await deps.requestApproval({
          approvalId: randomUUID(),
          toolName,
          input,
          summary: `${toolName} — ${verdict.reason}`,
          tier: verdict.decision === "break_glass" ? "break_glass" : "gated",
          justification: lastTextBlock.slice(0, 500),
        });
        return approved
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: "Denied by user." };
      }
      default:
        return { behavior: "deny", message: "Unclassified action denied." };
    }
  };

  let numTurns = 0;
  let inTok = 0;
  let outTok = 0;
  let usd = 0;
  let resultText = "";
  let errorText: string | null = null;

  const emit = (ev: StreamEvent) => {
    if (ev.type === "text") lastTextBlock = ev.value;
    deps.emit(ev);
  };

  try {
    const iterator = deps.query({
      prompt: prompt || agent.instructions,
      options: {
        cwd: agent.cwd ?? undefined,
        model: agent.model ?? undefined,
        maxTurns: agent.maxTurns ?? 30,
        permissionMode: "default",
        canUseTool,
        abortController: { signal: deps.abortSignal },
        env: sdkEnv(deps.claudeToken),
        // The server-tool RPC + real MCP wiring are attached by the runner host.
      },
    });
    for await (const msg of iterator) {
      if (deps.abortSignal.aborted) {
        cancelled = true;
        break;
      }
      mapMessage(msg, emit, () => {});
      if (msg.type === "result") {
        numTurns = msg.num_turns ?? numTurns;
        resultText = msg.subtype === "success" ? (msg.result ?? "") : "";
        usd = msg.total_cost_usd ?? usd;
        inTok = msg.usage?.input_tokens ?? inTok;
        outTok = msg.usage?.output_tokens ?? outTok;
        if (msg.subtype && msg.subtype !== "success") errorText = `Run ended: ${msg.subtype}`;
      } else if (msg.type === "assistant") {
        const u = msg.message?.usage;
        if (u) {
          inTok = u.input_tokens ?? inTok;
          outTok = u.output_tokens ?? outTok;
        }
      }
    }
  } catch (err) {
    if (deps.abortSignal.aborted) cancelled = true;
    else errorText = err instanceof Error ? err.message : String(err);
  }

  deps.reportUsage({ inputTokens: inTok, outputTokens: outTok, costUsd: usd, numTurns });

  const status = cancelled ? "cancelled" : errorText ? "failed" : "succeeded";
  return { status, error: errorText, result: resultText };
}

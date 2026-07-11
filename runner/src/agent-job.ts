import os from "os";
import path from "path";
import type { RunnerConfig } from "./config";
import type { EventUplink } from "./api";
import { authHeaders } from "./api";
import { waitForDecision } from "./approvals";
import { executeAgentRun, type QueryFn } from "@/lib/runner/execute-core";
import type { AgentConfig } from "@/types/agents";
import type { StreamEvent } from "@/lib/chat/blocks";

/**
 * The device host for an agent_run job: wires execute-core to the uplink
 * (run_event/usage/job_status frames), the durable approval bridge, and the
 * server-tool RPC. The SDK query is loaded from the device's node_modules at
 * runtime (kept out of the esbuild bundle — it ships platform binaries). In
 * tests, injectQuery() swaps in a fake.
 */

let queryImpl: QueryFn | null = null;
/** Test seam: inject a fake SDK query. */
export function injectQuery(fn: QueryFn | null): void {
  queryImpl = fn;
}

async function realQuery(): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require("@anthropic-ai/claude-agent-sdk") as { query: QueryFn };
  return sdk.query;
}

async function callServerTool(
  cfg: RunnerConfig,
  runId: string,
  tool: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const res = await fetch(new URL("/api/runner/tool-call", cfg.serverUrl), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(cfg) },
      body: JSON.stringify({ tool, runId, args }),
    });
    if (!res.ok) return `Tool ${tool} failed (HTTP ${res.status}).`;
    return ((await res.json()) as { text?: string }).text ?? "";
  } catch (err) {
    return `Tool ${tool} error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function runAgentJob(
  cfg: RunnerConfig,
  jobId: string,
  payload: { agentRunId: string; agent: AgentConfig; prompt: string; claudeToken?: string },
  uplink: EventUplink,
  signal: AbortSignal
): Promise<void> {
  const runId = payload.agentRunId;
  const agent = payload.agent;

  uplink.push({ type: "job_status", jobId, status: "running" });

  const query = queryImpl ?? (await realQuery());

  const result = await executeAgentRun(agent, payload.prompt, runId, {
    query,
    emit: (ev: StreamEvent) => uplink.push({ type: "run_event", jobId, runId, events: [ev] }),
    reportUsage: (u) => uplink.push({ type: "usage", jobId, runId, ...u }),
    requestApproval: async (r) => {
      uplink.push({ type: "approval_request", jobId, runId, ...r });
      await uplink.flush(); // get the request to the server promptly
      return waitForDecision(cfg, r.approvalId, signal);
    },
    callServerTool: (tool, args) => callServerTool(cfg, runId, tool, args),
    policyPaths: {
      // On the device, the runner's own install dir is the self-path to protect.
      selfPaths: [path.join(os.homedir(), ".matrix-runner")],
      dbPaths: [],
      extraDenylist: [],
    },
    maxChainDepthDefault: 3,
    abortSignal: signal,
  });

  // The device computes the final agent-run status; the server persists it.
  uplink.push({
    type: "job_status",
    jobId,
    status: result.status === "cancelled" ? "cancelled" : "done",
    runStatus: result.status,
    result: result.result.slice(0, 8000),
    error: result.error ?? undefined,
  });
  await uplink.flush();
}

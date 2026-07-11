import type { EventUplink } from "./api";
import type { RunnerConfig } from "./config";
import type { JobKind } from "@/lib/runner/protocol";
import { runAgentJob } from "./agent-job";
import type { AgentConfig } from "@/types/agents";

/**
 * Job execution registry. `ping` is the liveness echo; `agent_run` runs an
 * agent via the SDK on this device (P2); P4 adds `fs_op`/`console_stream`/
 * `ide_ctl` on the same shape. Every job gets an AbortController so
 * job_cancel/kill_switch can stop it.
 */

export interface JobContext {
  jobId: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  uplink: EventUplink;
  cfg: RunnerConfig;
}

type JobHandler = (ctx: JobContext) => Promise<void>;

const handlers: Partial<Record<JobKind, JobHandler>> = {
  ping: async ({ jobId, uplink }) => {
    uplink.push({ type: "job_status", jobId, status: "done" });
  },
  agent_run: async ({ jobId, payload, uplink, signal, cfg }) => {
    await runAgentJob(
      cfg,
      jobId,
      payload as unknown as {
        agentRunId: string;
        agent: AgentConfig;
        prompt: string;
        claudeToken?: string;
      },
      uplink,
      signal
    );
  },
};

const active = new Map<string, AbortController>();

export function activeJobCount(): number {
  return active.size;
}

export function cancelJob(jobId: string): void {
  active.get(jobId)?.abort();
}

export function cancelAllJobs(): void {
  for (const [, ac] of active) ac.abort();
}

export async function runJob(
  jobId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
  uplink: EventUplink,
  cfg: RunnerConfig
): Promise<void> {
  const handler = handlers[kind];
  if (!handler) {
    uplink.push({
      type: "job_status",
      jobId,
      status: "error",
      error: `Unsupported job kind: ${kind}`,
    });
    return;
  }
  const ac = new AbortController();
  active.set(jobId, ac);
  const stamp = () => new Date().toISOString();
  uplink.push({
    type: "log_lines",
    lines: [`[${stamp()}] job ${kind} ${jobId.slice(0, 8)} started`],
  });
  try {
    await handler({ jobId, payload, signal: ac.signal, uplink, cfg });
    uplink.push({ type: "log_lines", lines: [`[${stamp()}] job ${jobId.slice(0, 8)} finished`] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    uplink.push({
      type: "log_lines",
      lines: [`[${stamp()}] job ${jobId.slice(0, 8)} error: ${msg}`],
    });
    uplink.push({
      type: "job_status",
      jobId,
      status: ac.signal.aborted ? "cancelled" : "error",
      error: msg,
    });
  } finally {
    active.delete(jobId);
  }
}

/** P2+: register additional kinds without touching the dispatch loop. */
export function registerJobHandler(kind: JobKind, handler: JobHandler): void {
  handlers[kind] = handler;
}

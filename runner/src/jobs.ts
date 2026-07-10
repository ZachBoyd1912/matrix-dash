import type { EventUplink } from "./api";
import type { JobKind } from "@/lib/runner/protocol";

/**
 * Job execution registry. P1 ships the `ping` handler (liveness echo used by
 * the P0 spine test and the pairing tutorial); P2 adds `agent_run` (Agent SDK
 * execution) and P4 adds `fs_op`/`console_stream`/`ide_ctl` on the same shape.
 * Every job gets an AbortController so job_cancel/kill_switch can stop it.
 */

export interface JobContext {
  jobId: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  uplink: EventUplink;
}

type JobHandler = (ctx: JobContext) => Promise<void>;

const handlers: Partial<Record<JobKind, JobHandler>> = {
  ping: async ({ jobId, uplink }) => {
    uplink.push({ type: "job_status", jobId, status: "done" });
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
  uplink: EventUplink
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
  uplink.push({ type: "job_status", jobId, status: "running" });
  try {
    await handler({ jobId, payload, signal: ac.signal, uplink });
  } catch (err) {
    uplink.push({
      type: "job_status",
      jobId,
      status: ac.signal.aborted ? "cancelled" : "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    active.delete(jobId);
  }
}

/** P2+: register additional kinds without touching the dispatch loop. */
export function registerJobHandler(kind: JobKind, handler: JobHandler): void {
  handlers[kind] = handler;
}

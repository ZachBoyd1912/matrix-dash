import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireRunner } from "@/lib/auth/runner-auth";
import { markRunnerActivity, updateJobStatus, resolveFsResult } from "@/lib/services/runner-bus";
import { pushDeviceLog } from "@/lib/services/runner-console";
import {
  ingestRunEvents,
  recordRunnerUsage,
  recordRunnerResult,
  markRunnerRunStarted,
  finalizeRunnerRun,
} from "@/lib/services/runner-run-sink";
import { ingestApprovalRequest } from "@/lib/services/runner-approvals";
import { getSystemDb } from "@/lib/db/client";
import { runnerJobs } from "@/lib/db/schema";
import { notifyRunnerRunComplete } from "@/lib/services/runner-dispatch";
import { PROTOCOL_VERSION, type RunnerFrame } from "@/lib/runner/protocol";
import type { StreamEvent } from "@/lib/chat/blocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  protocolVersion: z.number().int(),
  frames: z.array(z.record(z.string(), z.unknown())).max(500),
});

const TERMINAL_JOB = new Set(["done", "error", "cancelled", "skipped_offline"]);

/**
 * The runner's uplink: batched RunnerFrames. Persists device-executed agent-run
 * transcripts/usage/status into the owner's per-account DB (via runner-run-sink,
 * in the device user's context), fans out to the live run view, bridges approval
 * requests to the server-side inbox, and drives the job lifecycle.
 */
export async function POST(req: Request) {
  const auth = requireRunner(req);
  if ("response" in auth) return auth.response;
  const { device } = auth;
  const userId = device.userId;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid frame batch" }, { status: 400 });
  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
    return Response.json(
      { error: "Protocol mismatch", minProtocol: PROTOCOL_VERSION },
      { status: 426 }
    );
  }

  markRunnerActivity(device.id);

  // Map a jobId to its agent-run id (only for this device's own jobs — the
  // device can't touch another account's runs even with a forged frame).
  const runIdFor = (jobId: string): string | null => {
    const job = getSystemDb()
      .select({ agentRunId: runnerJobs.agentRunId, userId: runnerJobs.userId })
      .from(runnerJobs)
      .where(eq(runnerJobs.id, jobId))
      .get();
    if (!job || job.userId !== userId) return null;
    return job.agentRunId ?? null;
  };

  let handled = 0;
  for (const raw of parsed.data.frames as unknown as RunnerFrame[]) {
    switch (raw.type) {
      case "pong":
        handled++;
        break;

      case "run_event":
        if (runIdFor(raw.jobId)) ingestRunEvents(raw.runId, userId, raw.events as StreamEvent[]);
        handled++;
        break;

      case "usage":
        if (runIdFor(raw.jobId)) {
          recordRunnerUsage(raw.runId, userId, {
            inputTokens: raw.inputTokens,
            outputTokens: raw.outputTokens,
            costUsd: raw.costUsd,
            numTurns: raw.numTurns,
          });
        }
        handled++;
        break;

      case "approval_request": {
        const runId = runIdFor(raw.jobId);
        if (runId) ingestApprovalRequest({ ...raw, runId, userId, deviceId: device.id });
        handled++;
        break;
      }

      case "job_status": {
        updateJobStatus(raw.jobId, raw.status, raw.error);
        const runId = runIdFor(raw.jobId);
        if (runId) {
          if (raw.status === "running") {
            markRunnerRunStarted(runId, userId);
          } else if (TERMINAL_JOB.has(raw.status)) {
            if (raw.result) recordRunnerResult(runId, userId, raw.result);
            const runStatus = raw.runStatus ?? (raw.status === "done" ? "succeeded" : "failed");
            finalizeRunnerRun(runId, userId, { status: runStatus, error: raw.error ?? null });
            await notifyRunnerRunComplete(runId, userId, runStatus).catch(() => {});
          }
        }
        handled++;
        break;
      }

      case "fs_result":
        resolveFsResult(raw.requestId, { ok: raw.ok, data: raw.data, error: raw.error });
        handled++;
        break;

      case "log_lines":
        pushDeviceLog(device.id, raw.lines);
        handled++;
        break;

      default:
        break; // forward compatibility
    }
  }

  return Response.json({ ok: true, handled });
}

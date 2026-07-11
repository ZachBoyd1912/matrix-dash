import { and, eq, isNull } from "drizzle-orm";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { runnerDevices, agentRuns, users } from "@/lib/db/schema";
import { getContextUserId } from "@/lib/db/context";
import { getOwner } from "@/lib/db/users";
import {
  enqueueJob,
  isRunnerOnline,
  sendToRunner,
  broadcastToRunners,
  setDispatchAugmenter,
} from "./runner-bus";
import { runnerJobs } from "@/lib/db/schema";
import { resolveSubscriptionToken } from "./runner-credentials";
import type { AgentConfig } from "@/types/agents";

// Merge the user's Claude subscription token into agent_run dispatch frames at
// SEND time — memory-only, per dispatch (incl. reconnect re-dispatch).
setDispatchAugmenter((job) => {
  if (job.kind !== "agent_run") return undefined;
  const token = resolveSubscriptionToken(job.userId);
  return token ? { claudeToken: token } : undefined;
});

/* ------------------------------------------------------------------ *
 * Server-side dispatch fork for agent runs. Decides whether a run
 * executes in-process (server-legacy, unchanged) or on the owning
 * user's paired device, and mirrors run completion (streak + notify)
 * for device-executed runs — the piece executeRun does in-process.
 * ------------------------------------------------------------------ */

/** Who owns the run being started: the ALS context user, else the owner. */
export function resolveRunUserId(): string | null {
  return getContextUserId() ?? getOwner()?.id ?? null;
}

function isOwnerUser(userId: string): boolean {
  return (
    getSystemDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
      ?.role === "owner"
  );
}

/** The user's default, online, non-revoked device — or null. */
export function pickDevice(userId: string): { id: string } | null {
  const rows = getSystemDb()
    .select({ id: runnerDevices.id, isDefault: runnerDevices.isDefault })
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, userId), isNull(runnerDevices.revokedAt)))
    .all();
  const online = rows.filter((r) => isRunnerOnline(r.id));
  if (online.length === 0) return null;
  return online.find((r) => r.isDefault) ?? online[0];
}

/** Does the user have any (non-revoked) paired device, online or not? */
function hasPairedDevice(userId: string): boolean {
  return !!getSystemDb()
    .select({ id: runnerDevices.id })
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, userId), isNull(runnerDevices.revokedAt)))
    .get();
}

/**
 * If the run's owner has an online device, mark the run for remote execution,
 * enqueue an agent_run job to that device, and return true (caller skips the
 * in-process queue). Otherwise return false → legacy in-process path.
 * Called from startRun, INSIDE the run's user context.
 */
export function tryDispatchToDevice(
  runId: string,
  agent: AgentConfig,
  prompt: string,
  trigger?: string
): boolean {
  const userId = resolveRunUserId();
  if (!userId) return false;
  const device = pickDevice(userId);

  if (!device) {
    // No ONLINE device. If a device is paired but offline and this is an
    // unattended trigger, skip it (decision 4) rather than run on the server;
    // interactive triggers (manual/chat/voice), or users with no device at
    // all, fall through to the in-process legacy path.
    if ((trigger === "cron" || trigger === "webhook") && hasPairedDevice(userId)) {
      getDb()
        .update(agentRuns)
        .set({
          status: "skipped_offline",
          error: "Device offline — scheduled run skipped.",
          endedAt: new Date().toISOString(),
        })
        .where(eq(agentRuns.id, runId))
        .run();
      void import("./agent-notify").then(({ notifyAgentEvent }) =>
        notifyAgentEvent("agent.run.failed", { agentId: agent.id, runId }).catch(() => {})
      );
      return true;
    }
    return false;
  }

  // Record the routing on the run row (in the current user context).
  getDb()
    .update(agentRuns)
    .set({ execution: "runner", deviceId: device.id })
    .where(eq(agentRuns.id, runId))
    .run();

  // Job payload: ids + the full agent config + prompt. The user's Claude
  // subscription token (decision 5) is NOT stored here — it's resolved fresh
  // and merged into the dispatch frame at send time (see dispatchJob), so it's
  // memory-only, survives reconnect re-dispatch, and never lands in runner_jobs.
  enqueueJob({
    userId,
    deviceId: device.id,
    kind: "agent_run",
    agentRunId: runId,
    payload: { agentRunId: runId, agent, prompt },
  });
  return true;
}

/**
 * If runId is a device-executed run, tell the device to cancel its job and
 * return true. Called in the run owner's context (agent_runs is per-account).
 */
export function cancelRunnerRun(runId: string): boolean {
  const run = getDb()
    .select({ execution: agentRuns.execution, deviceId: agentRuns.deviceId })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  if (run?.execution !== "runner" || !run.deviceId) return false;

  const job = getSystemDb()
    .select({ id: runnerJobs.id })
    .from(runnerJobs)
    .where(and(eq(runnerJobs.agentRunId, runId), eq(runnerJobs.deviceId, run.deviceId)))
    .get();
  if (job) sendToRunner(run.deviceId, { type: "job_cancel", jobId: job.id });

  getDb()
    .update(agentRuns)
    .set({ status: "cancelled", endedAt: new Date().toISOString() })
    .where(eq(agentRuns.id, runId))
    .run();
  return true;
}

/** Kill switch: hard-abort on every connected device. */
export function broadcastKillToRunners(): number {
  return broadcastToRunners({ type: "kill_switch" });
}

/** Completion bookkeeping for a device-executed run (mirrors notifyCompletion). */
export async function notifyRunnerRunComplete(
  runId: string,
  userId: string,
  status: string
): Promise<void> {
  const { notifyAgentEvent } = await import("./agent-notify");
  // Resolve the agent id for the run within the owner's DB.
  let agentId: string | null = null;
  runWithUser({ userId, isOwner: isOwnerUser(userId) }, () => {
    agentId =
      getDb()
        .select({ agentId: agentRuns.agentId })
        .from(agentRuns)
        .where(eq(agentRuns.id, runId))
        .get()?.agentId ?? null;
  });
  if (!agentId) return;

  const event =
    status === "succeeded"
      ? "agent.run.completed"
      : status === "needs_review"
        ? "agent.run.needs_review"
        : status === "failed" || status === "timeout"
          ? "agent.run.failed"
          : null;
  if (!event) return;
  await runWithUser({ userId, isOwner: isOwnerUser(userId) }, async () =>
    notifyAgentEvent(event, { agentId: agentId!, runId })
  );
}

import { and, eq, inArray } from "drizzle-orm";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { agentApprovals, agentRuns, runnerJobs, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";
import { sendToRunner } from "./runner-bus";

/* ------------------------------------------------------------------ *
 * Bridge for approvals raised by a device-executed agent run. The
 * device's canUseTool pauses awaiting a decision; here we persist the
 * request into the OWNER's agent_approvals (so the existing inbox / ntfy
 * / API decide it unchanged), and — durably — let the device RECONCILE
 * decisions by polling, not just by a pushed frame (a decision made while
 * the device is mid-reconnect must not be lost; waits are minutes–hours).
 * ------------------------------------------------------------------ */

function isOwnerUser(userId: string): boolean {
  return (
    getSystemDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
      ?.role === "owner"
  );
}

export interface IncomingApproval {
  runId: string;
  userId: string;
  deviceId: string;
  jobId: string;
  approvalId: string;
  toolName: string;
  input: Record<string, unknown>;
  summary: string;
  tier: "gated" | "break_glass";
  justification?: string;
}

/** Persist a device-raised approval into the owner's queue + notify. */
export function ingestApprovalRequest(a: IncomingApproval): void {
  const timeoutMin = Math.max(1, parseFloat(getSetting("agents_approval_timeout_min") ?? "60"));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMin * 60_000).toISOString();

  runWithUser({ userId: a.userId, isOwner: isOwnerUser(a.userId) }, () => {
    // Resolve agentId for the run; skip if the run isn't the device user's.
    const run = getDb()
      .select({ agentId: agentRuns.agentId })
      .from(agentRuns)
      .where(eq(agentRuns.id, a.runId))
      .get();
    if (!run) return;
    // Idempotent: the device may resend on reconnect.
    const existing = getDb()
      .select({ id: agentApprovals.id })
      .from(agentApprovals)
      .where(eq(agentApprovals.id, a.approvalId))
      .get();
    if (existing) return;

    getDb()
      .update(agentRuns)
      .set({ status: "awaiting_approval" })
      .where(eq(agentRuns.id, a.runId))
      .run();
    getDb()
      .insert(agentApprovals)
      .values({
        id: a.approvalId,
        runId: a.runId,
        agentId: run.agentId,
        toolName: a.toolName,
        input: JSON.stringify(a.input),
        summary: a.summary,
        tier: a.tier,
        justification: a.justification ?? null,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt,
      })
      .run();
  });

  void import("./agent-notify").then(({ notifyAgentEvent }) =>
    runWithUser({ userId: a.userId, isOwner: isOwnerUser(a.userId) }, async () =>
      notifyAgentEvent("agent.approval.pending", { agentId: a.runId, runId: a.runId }).catch(
        () => {}
      )
    )
  );
}

/**
 * Decisions for a device's currently-dispatched agent-run jobs. The device
 * polls this on connect + periodically so a decision landing during a
 * reconnect gap is never lost. Reads each owner-DB approval by its run.
 */
export function decisionsForDevice(
  deviceId: string,
  userId: string
): Array<{ approvalId: string; approved: boolean }> {
  // In-flight agent-run jobs on this device (dispatched or running) → run ids.
  const jobs = getSystemDb()
    .select({ agentRunId: runnerJobs.agentRunId })
    .from(runnerJobs)
    .where(
      and(eq(runnerJobs.deviceId, deviceId), inArray(runnerJobs.status, ["dispatched", "running"]))
    )
    .all();
  const runIds = jobs.map((j) => j.agentRunId).filter((x): x is string => !!x);
  if (runIds.length === 0) return [];

  const out: Array<{ approvalId: string; approved: boolean }> = [];
  runWithUser({ userId, isOwner: isOwnerUser(userId) }, () => {
    const rows = getDb()
      .select({ id: agentApprovals.id, status: agentApprovals.status })
      .from(agentApprovals)
      .where(inArray(agentApprovals.runId, runIds))
      .all();
    for (const r of rows) {
      if (r.status === "approved") out.push({ approvalId: r.id, approved: true });
      else if (r.status === "denied" || r.status === "expired")
        out.push({ approvalId: r.id, approved: false });
    }
  });
  return out;
}

/**
 * Fast-path push of a decision to the device (best-effort; the poll above is
 * the durable path). Called from the approvals decision route after settle,
 * IN the decider's account context (agent_approvals + agent_runs are per-account).
 */
export function pushApprovalDecision(approvalId: string, approved: boolean): void {
  const approval = getDb()
    .select({ runId: agentApprovals.runId })
    .from(agentApprovals)
    .where(eq(agentApprovals.id, approvalId))
    .get();
  if (!approval) return;
  const run = getDb()
    .select({ deviceId: agentRuns.deviceId, execution: agentRuns.execution })
    .from(agentRuns)
    .where(eq(agentRuns.id, approval.runId))
    .get();
  if (run?.execution === "runner" && run.deviceId) {
    sendToRunner(run.deviceId, { type: "approval_decision", approvalId, approved });
  }
}

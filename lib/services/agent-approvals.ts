import { randomBytes, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents, agentApprovals, agentRuns } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";
import { notifyAgentEvent } from "./agent-notify";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig, AlwaysAllowScope, LearnedRules } from "@/types/agents";
import type { StreamEvent } from "@/lib/chat/blocks";

/**
 * Persistent, DB-backed approval queue. When the policy engine returns `queue`
 * or `break_glass`, the run pauses inside canUseTool until the human decides.
 *
 * Durability: the decision truth lives in the agent_approvals row; an in-process
 * promise registry gives an instant resume when the decision arrives via the API,
 * and a 5s DB poll covers decisions written by anything else (e.g. the signed
 * ntfy/Telegram action endpoint).
 */

interface Pending {
  resolve: (r: PermissionResult) => void;
  runId: string;
}

interface Registry {
  pending: Map<string, Pending>;
}

const KEY = Symbol.for("matrix-dash.agent-approvals");
function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  if (!g[KEY]) g[KEY] = { pending: new Map() };
  return g[KEY]!;
}

export interface ApprovalRequestArgs {
  runId: string;
  agent: AgentConfig;
  toolName: string;
  input: Record<string, unknown>;
  verdict: { decision: string; reason: string };
  emit: (ev: StreamEvent) => void;
  /** Last assistant text — used as the break-glass justification. */
  justification?: string;
}

function summarize(toolName: string, input: Record<string, unknown>): string {
  const p = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  if (toolName === "Bash" && typeof input.command === "string") {
    return `Bash: ${input.command.slice(0, 160)}`;
  }
  if (p) return `${toolName} ${p}`;
  return toolName;
}

/** Called by the runner's canUseTool for queue/break_glass decisions. */
export async function awaitApproval(args: ApprovalRequestArgs): Promise<PermissionResult> {
  const { runId, agent, toolName, input, verdict, emit } = args;
  const approvalId = randomUUID();
  const signedToken = randomBytes(24).toString("hex");
  const tier = verdict.decision === "break_glass" ? "break_glass" : "gated";
  const summary = summarize(toolName, input);
  const timeoutMin = Math.max(1, parseFloat(getSetting("agents_approval_timeout_min") ?? "60"));
  const now = Date.now();
  const expiresAt = new Date(now + timeoutMin * 60_000).toISOString();

  getDb()
    .insert(agentApprovals)
    .values({
      id: approvalId,
      runId,
      agentId: agent.id,
      toolName,
      input: JSON.stringify(input).slice(0, 8000),
      summary,
      tier,
      justification: tier === "break_glass" ? (args.justification ?? verdict.reason) : null,
      status: "pending",
      signedToken,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    })
    .run();

  getDb()
    .update(agentRuns)
    .set({ status: "awaiting_approval" })
    .where(eq(agentRuns.id, runId))
    .run();

  emit({ type: "approval_request", id: approvalId, name: toolName, args: input, summary });
  void notifyAgentEvent("agent.approval.pending", {
    agentId: agent.id,
    runId,
    approvalId,
    title: `${agent.name} needs approval`,
    body: summary,
  }).catch(() => {});

  const result = await new Promise<PermissionResult>((resolve) => {
    const st = { settled: false };
    const done = (r: PermissionResult) => {
      if (st.settled) return;
      st.settled = true;
      clearInterval(poll);
      registry().pending.delete(approvalId);
      resolve(r);
    };
    // The registry lets settleApproval() resolve this instantly via the API path.
    registry().pending.set(approvalId, { runId, resolve: done });
    // The poll is the durable fallback: it settles on any out-of-band decision
    // (signed URL) and on expiry.
    const poll = setInterval(() => {
      const row = getDb()
        .select({ status: agentApprovals.status })
        .from(agentApprovals)
        .where(eq(agentApprovals.id, approvalId))
        .get();
      if (!row) return;
      if (row.status === "pending") {
        if (Date.now() >= new Date(expiresAt).getTime()) {
          getDb()
            .update(agentApprovals)
            .set({ status: "expired", decidedAt: new Date().toISOString() })
            .where(eq(agentApprovals.id, approvalId))
            .run();
          done({ behavior: "deny", message: "Approval timed out." });
        }
        return;
      }
      done(
        row.status === "approved"
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: "Denied." }
      );
    }, 5000);
  });

  // Restore run to running + reflect the decision in the transcript.
  const decided = getDb()
    .select({ status: agentApprovals.status })
    .from(agentApprovals)
    .where(eq(agentApprovals.id, approvalId))
    .get();
  emit({
    type: "approval_resolved",
    id: approvalId,
    decision: decided?.status === "approved" ? "allow" : "deny",
  });
  getDb().update(agentRuns).set({ status: "running" }).where(eq(agentRuns.id, runId)).run();

  return result;
}

/** Apply a human decision: update the row, learn a rule, resolve the paused run. */
export function settleApproval(
  approvalId: string,
  decision: "approve" | "deny",
  alwaysAllow?: AlwaysAllowScope,
  input?: Record<string, unknown>
): { ok: boolean; reason?: string } {
  const row = getDb().select().from(agentApprovals).where(eq(agentApprovals.id, approvalId)).get();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "pending") return { ok: false, reason: "already_decided" };

  getDb()
    .update(agentApprovals)
    .set({
      status: decision === "approve" ? "approved" : "denied",
      decidedAt: new Date().toISOString(),
      signedToken: null, // single-use: burn the action token
    })
    .where(eq(agentApprovals.id, approvalId))
    .run();

  if (decision === "approve" && alwaysAllow) {
    applyLearnedRule(row.agentId, alwaysAllow);
  }

  finalize(approvalId, decision === "approve", input);
  return { ok: true };
}

/** Resolve the paused promise for a decided approval (if this process holds it). */
function finalize(approvalId: string, approved: boolean, input?: Record<string, unknown>): void {
  const entry = registry().pending.get(approvalId);
  if (!entry) return;
  registry().pending.delete(approvalId);
  entry.resolve(
    approved
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Denied by user." }
  );
}

function applyLearnedRule(agentId: string, scope: AlwaysAllowScope): void {
  const row = getDb()
    .select({ learnedRules: agents.learnedRules })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();
  let rules: LearnedRules = { paths: [], commands: [] };
  try {
    const parsed = JSON.parse(row?.learnedRules ?? "{}");
    rules = {
      paths: Array.isArray(parsed.paths) ? parsed.paths : [],
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
    };
  } catch {
    /* default */
  }
  if (scope.pathPrefix && !rules.paths.includes(scope.pathPrefix))
    rules.paths.push(scope.pathPrefix);
  if (scope.commandPattern && !rules.commands.includes(scope.commandPattern))
    rules.commands.push(scope.commandPattern);
  getDb()
    .update(agents)
    .set({ learnedRules: JSON.stringify(rules), updatedAt: new Date().toISOString() })
    .where(eq(agents.id, agentId))
    .run();
}

/** Resolve an approval by its single-use signed token (ntfy/Telegram action URLs). */
export function settleBySignedToken(
  token: string,
  decision: "approve" | "deny"
): { ok: boolean; reason?: string } {
  const row = getDb()
    .select({ id: agentApprovals.id, status: agentApprovals.status })
    .from(agentApprovals)
    .where(eq(agentApprovals.signedToken, token))
    .get();
  if (!row) return { ok: false, reason: "invalid_or_used" };
  if (row.status !== "pending") return { ok: false, reason: "already_decided" };
  return settleApproval(row.id, decision);
}

/** Boot cleanup — orphan any approvals still pending after a restart. */
export function orphanPendingApprovals(): void {
  try {
    getDb()
      .update(agentApprovals)
      .set({ status: "orphaned", decidedAt: new Date().toISOString() })
      .where(eq(agentApprovals.status, "pending"))
      .run();
  } catch {
    /* ignore */
  }
}

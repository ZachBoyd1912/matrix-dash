import { randomUUID } from "crypto";
import { setSetting } from "@/lib/db/settings";
import type { ApprovalDecision, StreamEvent } from "@/lib/chat/blocks";
import type { PowerLevel } from "@/lib/ai/power";

/**
 * Interactive approval side-channel. A tool's `execute()` pauses by awaiting a
 * Promise that is resolved out-of-band by `POST /api/ai/approve` when the user
 * clicks Allow/Deny. The Promise is held in a process-wide registry, which is safe
 * ONLY because matrix-dash is a single long-lived self-hosted Node process (same
 * basis as the DB/daemon singletons). Pinned to globalThis so Next dev HMR doesn't
 * create a second map that the approve route can't see.
 *
 * Awaiting inside `execute()` holds the streamText step open with no extra plumbing
 * — the SDK awaits the execute promise before emitting the tool-result and before
 * advancing the step counter.
 */

/** Per-request context handed to tools via streamText's `experimental_context`. */
export interface AgentRequestContext {
  /** Write an NDJSON event into the live response stream. */
  emit: (ev: StreamEvent) => void;
  /** The request's abort signal — releases a pending approval if the client leaves. */
  signal?: AbortSignal;
  sessionId?: string | null;
  powerLevel: PowerLevel;
}

interface PendingEntry {
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
  onAbort: () => void;
  signal?: AbortSignal;
  toolName: string;
}

const g = globalThis as unknown as { __mdApprovals?: Map<string, PendingEntry> };
const pending: Map<string, PendingEntry> = (g.__mdApprovals ??= new Map());

/** Auto-deny a pending approval after this long so the agent loop never wedges. */
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Ask the user to approve a tool action. Emits a `approval_request` event, then
 * resolves when the user decides (via settleApproval), the request aborts, or it
 * times out (→ deny). Always emits a matching `approval_resolved` so the UI and the
 * persisted transcript reflect the outcome.
 */
export function requestApproval(
  ctx: AgentRequestContext,
  args: { toolCallId: string; toolName: string; input: unknown; summary?: string }
): Promise<ApprovalDecision> {
  const approvalId = randomUUID();

  const p = new Promise<ApprovalDecision>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(approvalId)) resolve("deny");
    }, TIMEOUT_MS);
    const onAbort = () => {
      if (pending.delete(approvalId)) {
        clearTimeout(timer);
        resolve("deny");
      }
    };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(approvalId, {
      resolve,
      timer,
      onAbort,
      signal: ctx.signal,
      toolName: args.toolName,
    });
  });

  ctx.emit({
    type: "approval_request",
    id: approvalId,
    name: args.toolName,
    args: args.input,
    summary: args.summary,
  });

  return p.then((decision) => {
    ctx.emit({ type: "approval_resolved", id: approvalId, decision });
    return decision;
  });
}

/**
 * Settle a pending approval (called by the approve route). Delete-before-resolve
 * makes the first decision win and late/duplicate POSTs a no-op (→ 404). Returns
 * false if the id is unknown/already settled (e.g. timed out, or server restarted).
 */
export function settleApproval(approvalId: string, decision: ApprovalDecision): boolean {
  const entry = pending.get(approvalId);
  if (!entry) return false;
  pending.delete(approvalId);
  clearTimeout(entry.timer);
  entry.signal?.removeEventListener("abort", entry.onAbort);
  // "Allow always" persists the per-tool flag so future turns skip the prompt.
  if (decision === "allow_always") {
    try {
      setSetting(`approve_${entry.toolName}`, "1");
    } catch {
      /* best-effort */
    }
  }
  entry.resolve(decision);
  return true;
}

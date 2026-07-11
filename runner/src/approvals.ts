import type { RunnerConfig } from "./config";
import { authHeaders } from "./api";

/**
 * Durable approval waiting on the device side. A gated tool blocks here until
 * the user decides — minutes to hours, DURING which the connect stream will
 * drop and reconnect. So we don't trust the pushed `approval_decision` frame
 * alone: we ALSO poll GET /api/runner/approvals. Whichever arrives first wins.
 * This mirrors the server's registry + 5s-DB-poll approvals pattern across the
 * network boundary.
 */

const pushed = new Map<string, boolean>(); // approvalId → approved (from frames)

/** Called by the connect loop when an approval_decision frame arrives. */
export function recordPushedDecision(approvalId: string, approved: boolean): void {
  pushed.set(approvalId, approved);
}

const POLL_MS = 4000;

export async function waitForDecision(
  cfg: RunnerConfig,
  approvalId: string,
  signal: AbortSignal
): Promise<boolean> {
  for (;;) {
    if (signal.aborted) return false;
    if (pushed.has(approvalId)) {
      const v = pushed.get(approvalId)!;
      pushed.delete(approvalId);
      return v;
    }
    try {
      const res = await fetch(new URL("/api/runner/approvals", cfg.serverUrl), {
        headers: authHeaders(cfg),
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          decisions: Array<{ approvalId: string; approved: boolean }>;
        };
        const hit = data.decisions.find((d) => d.approvalId === approvalId);
        if (hit) return hit.approved;
      }
    } catch {
      // Network blip mid-wait — keep waiting; the decision persists server-side.
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

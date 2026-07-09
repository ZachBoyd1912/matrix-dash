import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";
import { notify, fireWebhooks } from "./notify";

/**
 * Fan-out for agent-system events across every configured channel (in-app,
 * outbound webhooks/ntfy, and — for pending approvals/failures — email).
 * Routine events are suppressed during quiet hours; `urgent` always breaks through.
 * Never throws.
 */
export type AgentEventKind =
  | "agent.run.completed"
  | "agent.run.failed"
  | "agent.run.needs_review"
  | "agent.run.urgent"
  | "agent.approval.pending"
  | "agent.schedule.disabled";

interface EventPayload {
  agentId?: string;
  runId?: string;
  approvalId?: string;
  title?: string;
  body?: string;
  href?: string;
  urgent?: boolean;
}

function withinQuietHours(now = new Date()): boolean {
  const start = getSetting("agents_quiet_hours_start") || "";
  const end = getSetting("agents_quiet_hours_end") || "";
  if (!start || !end) return false;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const s = toMin(start);
  const e = toMin(end);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s == null || e == null) return false;
  // Window may wrap past midnight (e.g. 23:00 → 07:00).
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

function agentName(agentId?: string): string {
  if (!agentId) return "Agent";
  const row = getDb()
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();
  return row?.name ?? "Agent";
}

const NOTIFY_KIND: Record<AgentEventKind, "info" | "success" | "warning" | "error"> = {
  "agent.run.completed": "success",
  "agent.run.failed": "error",
  "agent.run.needs_review": "warning",
  "agent.run.urgent": "error",
  "agent.approval.pending": "warning",
  "agent.schedule.disabled": "warning",
};

export async function notifyAgentEvent(kind: AgentEventKind, payload: EventPayload): Promise<void> {
  const urgent = payload.urgent === true || kind === "agent.run.urgent";
  // Suppress routine notifications during quiet hours; urgent always fires.
  if (!urgent && withinQuietHours()) {
    void fireWebhooks(kind, payload);
    return;
  }

  const name = agentName(payload.agentId);
  const title = payload.title ?? defaultTitle(kind, name);
  const href = payload.href ?? hrefFor(kind, payload);

  await notify({
    title,
    body: payload.body ?? "",
    kind: NOTIFY_KIND[kind],
    href,
  });
  void fireWebhooks(kind, payload);
  void sendEmailIfConfigured(kind, title, payload.body ?? "").catch(() => {});
}

function defaultTitle(kind: AgentEventKind, name: string): string {
  switch (kind) {
    case "agent.run.completed":
      return `${name} finished`;
    case "agent.run.failed":
      return `${name} failed`;
    case "agent.run.needs_review":
      return `${name} needs review`;
    case "agent.run.urgent":
      return `${name} — urgent`;
    case "agent.approval.pending":
      return `${name} needs approval`;
    case "agent.schedule.disabled":
      return `${name} schedule auto-disabled`;
  }
}

function hrefFor(kind: AgentEventKind, payload: EventPayload): string {
  if (kind === "agent.approval.pending") return "/dashboard/agents/approvals";
  if (payload.runId) return `/dashboard/agents/runs/${payload.runId}`;
  if (payload.agentId) return `/dashboard/agents/${payload.agentId}`;
  return "/dashboard/agents";
}

/** Best-effort email to the configured notify address (reuses whatever transport exists). */
async function sendEmailIfConfigured(
  kind: AgentEventKind,
  subject: string,
  body: string
): Promise<void> {
  const to = getSetting("agents_notify_email");
  if (!to) return;
  // Only email on higher-signal events, not every completion.
  if (kind === "agent.run.completed") return;
  const mod = (await import("./email").catch(() => null)) as {
    sendMailBestEffort?: (to: string, subject: string, body: string) => Promise<void>;
  } | null;
  await mod?.sendMailBestEffort?.(to, subject, body);
}

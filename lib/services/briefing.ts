import { eq, gte, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  projects,
  siteHealth,
  pipelineItems,
  agentRuns,
  agentApprovals,
  tasks,
} from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";

/**
 * The single briefing composer. Both renderers — the Overview page
 * (GET /api/briefing) and the spoken morning briefing (agent-digest.ts) —
 * read this one structure so page and voice can never drift.
 */
export interface Briefing {
  generatedAt: string;
  staleness: { lastSyncedAt: string | null; isStale: boolean };
  /** Red items, ordered: sites down → overdue tasks → needs_review runs → missing paths → stale sync. */
  attention: string[];
  projects: {
    active: number;
    missing: number;
    dirty: { name: string; dirtyFiles: number }[];
    recent: { name: string; lastCommitAt: string; lastCommitMessage: string | null }[];
  };
  github: { openIssues: number; warning: string | null };
  sites: { label: string; ok: boolean; lastStatus: number | null; lastOkAt: string | null }[];
  pipeline: { openBlockers: string[]; leads: number };
  agents: {
    overnightRuns: number;
    succeeded: number;
    failed: number;
    needsReview: number;
    pendingApprovals: number;
  };
  tasks: { dueToday: number; overdue: number };
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function composeBriefing(): Briefing {
  const db = getDb();
  const now = new Date();

  const lastSyncedAt = getSetting("portfolio_last_synced_at");
  const isStale =
    !lastSyncedAt || now.getTime() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;

  const allProjects = db
    .select()
    .from(projects)
    .all()
    .filter((p) => !p.isArchived);
  const missing = allProjects.filter((p) => p.presence === "missing");
  const dirty = allProjects
    .filter((p) => (p.dirtyFiles ?? 0) > 0)
    .sort((a, b) => (b.dirtyFiles ?? 0) - (a.dirtyFiles ?? 0))
    .map((p) => ({ name: p.name, dirtyFiles: p.dirtyFiles ?? 0 }));
  const recent = allProjects
    .filter((p) => p.lastCommitAt)
    .sort((a, b) => (b.lastCommitAt ?? "").localeCompare(a.lastCommitAt ?? ""))
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      lastCommitAt: p.lastCommitAt as string,
      lastCommitMessage: p.lastCommitMessage,
    }));
  const openIssues = allProjects.reduce((sum, p) => sum + (p.openIssues ?? 0), 0);

  const sites = db
    .select()
    .from(siteHealth)
    .all()
    .map((s) => ({
      label: s.label,
      // Never probed yet counts as ok=false but won't hit attention (no lastStatus)
      ok: s.lastStatus !== null && s.consecutiveFailures === 0,
      lastStatus: s.lastStatus,
      lastOkAt: s.lastOkAt,
      neverChecked: s.lastStatus === null,
    }));

  const pipelineRows = db
    .select()
    .from(pipelineItems)
    .where(eq(pipelineItems.status, "open"))
    .all();
  const openBlockers = pipelineRows.filter((p) => p.kind === "blocker").map((p) => p.title);
  const leads = pipelineRows.filter((p) => p.kind === "lead" || p.kind === "enquiry").length;

  // Same window/semantics the spoken briefing has always used (16h overnight)
  const since = new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString();
  const runs = db
    .select({ status: agentRuns.status })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, since))
    .all();
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed" || r.status === "timeout").length;
  const needsReview = runs.filter((r) => r.status === "needs_review").length;
  const pendingApprovals = db
    .select({ id: agentApprovals.id })
    .from(agentApprovals)
    .where(eq(agentApprovals.status, "pending"))
    .all().length;

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const openTasks = db
    .select({ dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.isDone, false)))
    .all()
    .filter((t) => t.dueAt);
  const overdue = openTasks.filter((t) => new Date(t.dueAt as string) < now).length;
  const dueToday = openTasks.filter((t) => {
    const d = new Date(t.dueAt as string);
    return d >= now && d <= todayEnd;
  }).length;

  const attention: string[] = [];
  for (const s of sites) {
    if (!s.ok && !s.neverChecked)
      attention.push(`${s.label} is failing (last status ${s.lastStatus ?? "no response"})`);
  }
  if (overdue > 0) attention.push(`${overdue} task${overdue === 1 ? "" : "s"} overdue`);
  if (needsReview > 0)
    attention.push(`${needsReview} agent run${needsReview === 1 ? "" : "s"} need review`);
  if (pendingApprovals > 0)
    attention.push(`${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} waiting`);
  if (missing.length > 0)
    attention.push(
      `${missing.length} project path${missing.length === 1 ? "" : "s"} no longer exist — archive or relink`
    );
  if (isStale)
    attention.push(
      lastSyncedAt
        ? `Briefing may be stale — last sync ${Math.round((now.getTime() - new Date(lastSyncedAt).getTime()) / 3600000)}h ago`
        : "Portfolio has never synced — run Sync now"
    );

  return {
    generatedAt: now.toISOString(),
    staleness: { lastSyncedAt, isStale },
    attention,
    projects: {
      active: allProjects.filter((p) => p.presence && p.presence !== "missing").length,
      missing: missing.length,
      dirty,
      recent,
    },
    github: { openIssues, warning: getSetting("github_sync_warning") || null },
    sites: sites.map(({ neverChecked: _n, ...rest }) => rest),
    pipeline: { openBlockers, leads },
    agents: { overnightRuns: runs.length, succeeded, failed, needsReview, pendingApprovals },
    tasks: { dueToday, overdue },
  };
}

/**
 * Sentence form for TTS. Hard budget ≤280 chars — the voice announcer
 * truncates at 300 (components/layout/voice-announcer.tsx) and a cut-off
 * sentence sounds broken.
 */
export function renderSpoken(b: Briefing): string {
  const parts: string[] = [];
  if (b.attention.length > 0) {
    parts.push(`Heads up: ${b.attention.slice(0, 2).join("; ")}.`);
  }
  if (b.agents.overnightRuns === 0) parts.push("No agent runs overnight.");
  else {
    const bits = [`${b.agents.overnightRuns} agent runs overnight`];
    if (b.agents.succeeded) bits.push(`${b.agents.succeeded} succeeded`);
    if (b.agents.failed) bits.push(`${b.agents.failed} failed`);
    parts.push(`${bits.join(", ")}.`);
  }
  if (b.tasks.dueToday > 0)
    parts.push(`${b.tasks.dueToday} task${b.tasks.dueToday === 1 ? "" : "s"} due today.`);
  if (b.pipeline.openBlockers.length > 0)
    parts.push(`${b.pipeline.openBlockers.length} blockers to first sale.`);

  let out = parts.join(" ");
  if (out.length > 280) out = out.slice(0, 277) + "...";
  return out || "All quiet. Nothing needs attention.";
}

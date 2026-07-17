"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BrainCircuit,
  Sparkles,
  Network,
  Pin,
  AlertTriangle,
  RefreshCw,
  FolderGit2,
  Globe,
  Bot,
  Banknote,
  Archive,
  GitBranch,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface MemoryStats {
  total: number;
  links: number;
  pinned: number;
  counts: Record<string, number>;
}

interface Briefing {
  generatedAt: string;
  staleness: { lastSyncedAt: string | null; isStale: boolean };
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

interface ProjectRow {
  id: string;
  name: string;
  presence: string | null;
  visibility: string | null;
  branch: string | null;
  lastCommitAt: string | null;
  dirtyFiles: number | null;
  isArchived: boolean | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PRESENCE_BADGE: Record<string, string> = {
  "local+github": "text-emerald-400 ring-emerald-400/25",
  "local-only": "text-sky-400 ring-sky-400/25",
  "github-only": "text-amber-400 ring-amber-400/25",
  missing: "text-rose-400 ring-rose-400/25",
};

export default function Overview() {
  const ref = useGsapEntrance();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/briefing")
      .then((r) => r.json())
      .then(setBriefing)
      .catch(() => {});
    fetch("/api/projects")
      .then((r) => r.json())
      .then((rows) => setProjects(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/memories/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    refresh();
  }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await fetch("/api/portfolio/sync", { method: "POST" });
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  const archive = async (id: string) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    }).catch(() => {});
    refresh();
  };

  const visible = projects.filter((p) => !p.isArchived);

  return (
    <div ref={ref} className="mx-auto max-w-6xl space-y-6 px-4 py-10 md:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">
            <Sparkles size={11} /> Daily Briefing
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">
            {new Date().getHours() < 12
              ? "Good morning."
              : new Date().getHours() < 18
                ? "Good afternoon."
                : "Good evening."}
          </h1>
          <p className="text-text-muted mt-2 text-xs">
            {briefing?.staleness.lastSyncedAt
              ? `Synced ${timeAgo(briefing.staleness.lastSyncedAt)}`
              : "Never synced"}
          </p>
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="text-text-secondary hover:text-text-primary flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs transition-colors hover:border-white/20 disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {/* Attention strip */}
      {briefing && briefing.attention.length > 0 && (
        <Card className="border-rose-400/20 bg-rose-500/[0.04]">
          <div className="text-text-muted mb-2 flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <AlertTriangle size={12} className="text-rose-400" /> Needs attention
          </div>
          <ul className="space-y-1.5">
            {briefing.attention.map((a) => (
              <li key={a} className="text-text-primary flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                {a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Business / pipeline + Sites + Agents */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="text-text-muted mb-3 flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <Banknote size={12} className="text-amber-400" /> Path to first sale
          </div>
          {briefing ? (
            <>
              <div className="text-text-primary display text-3xl font-bold tabular-nums">
                {briefing.pipeline.openBlockers.length}
                <span className="text-text-muted ml-2 text-sm font-normal">open blockers</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {briefing.pipeline.openBlockers.map((b) => (
                  <li key={b} className="text-text-secondary flex items-start gap-2 text-xs">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    {b}
                  </li>
                ))}
              </ul>
              <p className="text-text-muted mt-3 text-xs">
                {briefing.pipeline.leads} lead{briefing.pipeline.leads === 1 ? "" : "s"} · plan:{" "}
                <span className="font-mono">monetization-plan-zbautomations.ie.md</span>
              </p>
            </>
          ) : (
            <p className="text-text-muted text-xs">Loading…</p>
          )}
        </Card>

        <Card>
          <div className="text-text-muted mb-3 flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <Globe size={12} className="text-sky-400" /> Sites
          </div>
          <div className="space-y-2.5">
            {briefing?.sites.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{s.label}</span>
                {s.lastStatus === null ? (
                  <span className="text-text-muted text-xs">not checked</span>
                ) : s.ok ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> up
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> {s.lastStatus}
                  </span>
                )}
              </div>
            )) ?? <p className="text-text-muted text-xs">Loading…</p>}
          </div>
        </Card>

        <Card>
          <div className="text-text-muted mb-3 flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <Bot size={12} className="text-emerald-400" /> Agents & tasks
          </div>
          {briefing ? (
            <div className="space-y-2 text-sm">
              <Row label="Runs overnight" value={briefing.agents.overnightRuns} />
              {briefing.agents.needsReview > 0 && (
                <Row label="Need review" value={briefing.agents.needsReview} tone="rose" />
              )}
              {briefing.agents.pendingApprovals > 0 && (
                <Link href="/dashboard/agents/approvals" className="block">
                  <Row
                    label="Approvals waiting"
                    value={briefing.agents.pendingApprovals}
                    tone="amber"
                  />
                </Link>
              )}
              <Row label="Tasks due today" value={briefing.tasks.dueToday} />
              {briefing.tasks.overdue > 0 && (
                <Row label="Overdue" value={briefing.tasks.overdue} tone="rose" />
              )}
            </div>
          ) : (
            <p className="text-text-muted text-xs">Loading…</p>
          )}
        </Card>
      </div>

      {/* Projects */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-text-muted flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <FolderGit2 size={12} className="text-emerald-400" /> Projects
            {briefing && (
              <span className="text-text-muted tracking-normal normal-case">
                — {briefing.projects.active} active
                {briefing.github.openIssues > 0 &&
                  `, ${briefing.github.openIssues} open issues/PRs`}
              </span>
            )}
          </div>
          <Link
            href="/dashboard/projects"
            className="text-text-muted hover:text-text-primary text-xs transition-colors"
          >
            Project planning →
          </Link>
        </div>
        {briefing?.github.warning && (
          <p className="mb-3 text-xs text-amber-400">
            GitHub sync degraded: {briefing.github.warning}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-text-muted text-xs">
            No projects yet — hit Sync now to scan your disk and GitHub.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] ring-1 ${PRESENCE_BADGE[p.presence ?? ""] ?? "text-text-muted ring-white/10"}`}
                >
                  {p.presence ?? "unsynced"}
                </span>
                <span className="text-text-primary min-w-0 flex-1 truncate font-medium">
                  {p.name}
                </span>
                {p.visibility && <span className="text-text-muted text-xs">{p.visibility}</span>}
                {p.branch && (
                  <span className="text-text-muted hidden items-center gap-1 text-xs sm:flex">
                    <GitBranch size={11} /> {p.branch}
                  </span>
                )}
                {(p.dirtyFiles ?? 0) > 0 && (
                  <span className="text-xs text-amber-400">{p.dirtyFiles} dirty</span>
                )}
                <span className="text-text-muted w-16 text-right text-xs">
                  {timeAgo(p.lastCommitAt)}
                </span>
                {p.presence === "missing" && (
                  <button
                    onClick={() => archive(p.id)}
                    title="Archive (path no longer exists)"
                    className="text-text-muted hover:text-rose-400"
                  >
                    <Archive size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Memory stats — demoted to the bottom row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<BrainCircuit size={16} />}
          label="Memories"
          value={stats?.total ?? "—"}
          accent="emerald"
        />
        <StatCard
          icon={<Network size={16} />}
          label="Links"
          value={stats?.links ?? "—"}
          accent="sky"
        />
        <StatCard
          icon={<Pin size={16} />}
          label="Pinned"
          value={stats?.pinned ?? "—"}
          accent="amber"
        />
        <StatCard
          icon={<Sparkles size={16} />}
          label="Identity facts"
          value={stats?.counts.identity ?? "—"}
          accent="emerald"
        />
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: "rose" | "amber" }) {
  const color =
    tone === "rose" ? "text-rose-400" : tone === "amber" ? "text-amber-400" : "text-text-primary";
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary text-xs">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "emerald" | "sky" | "amber" | "rose";
}

const ACCENT_RING: Record<StatProps["accent"], string> = {
  emerald: "ring-emerald-400/25 text-emerald-400",
  sky: "ring-sky-400/25 text-sky-400",
  amber: "ring-amber-400/25 text-amber-400",
  rose: "ring-rose-400/25 text-rose-400",
};

function StatCard({ icon, label, value, accent }: StatProps) {
  return (
    <Card interactive className="cursor-default">
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${ACCENT_RING[accent]} bg-white/[0.02]`}
        >
          {icon}
        </div>
        <span className="text-text-muted text-[10px] tracking-[0.16em] uppercase">{label}</span>
      </div>
      <div className="text-text-primary display text-3xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, History as HistoryIcon, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/lib/stores/use-feedback";
import type { AgentConfig } from "@/types/agents";

interface RunRow {
  id: string;
  status: string;
  trigger: string;
  dryRun: boolean;
  urgent: boolean;
  costUsd: number;
  numTurns: number;
  result: string | null;
  error: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, string> = {
  succeeded: "text-emerald-400",
  running: "text-sky-400",
  awaiting_approval: "text-amber-400",
  needs_review: "text-amber-400",
  failed: "text-rose-400",
  timeout: "text-rose-400",
  cancelled: "text-text-muted",
  interrupted: "text-text-muted",
  queued: "text-text-muted",
};

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([fetch(`/api/agents/${id}`), fetch(`/api/agents/${id}/runs`)]);
    if (a.ok) setAgent((await a.json()) as AgentConfig);
    if (r.ok) setRuns((await r.json()) as RunRow[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(dryRun: boolean) {
    setStarting(true);
    try {
      const res = await fetch(`/api/agents/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to start");
      }
      const { runId } = (await res.json()) as { runId: string };
      window.location.href = `/dashboard/agents/runs/${runId}`;
    } catch (err) {
      toast.error("Could not start run", err instanceof Error ? err.message : undefined);
    } finally {
      setStarting(false);
    }
  }

  if (!agent) {
    return (
      <div className="text-text-muted flex items-center gap-2 p-8 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <Link
        href="/dashboard/agents"
        className="text-text-muted hover:text-text-primary inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="display text-2xl">{agent.name}</h1>
          <p className="text-text-secondary mt-1 text-sm">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={starting} onClick={() => run(true)}>
            <FlaskConical className="mr-1.5 h-4 w-4" /> Dry run
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={starting || !agent.isEnabled}
            onClick={() => run(false)}
          >
            {starting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            Run now
          </Button>
          <Link href={`/dashboard/agents/${id}/versions`}>
            <Button variant="ghost" size="sm">
              <HistoryIcon className="mr-1.5 h-4 w-4" /> Versions
            </Button>
          </Link>
        </div>
      </div>

      {agent.mode === "standing_watch" && agent.scheduleEnabled && (
        <Card className="flex items-center gap-2 border-sky-500/40 p-3 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
          </span>
          Watching
          {agent.lastRunAt ? ` · last check-in ${new Date(agent.lastRunAt).toLocaleString()}` : ""}
        </Card>
      )}

      <Card className="p-4 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Meta label="Mode" value={agent.mode} />
          <Meta label="Model" value={agent.model ?? "Sonnet (default)"} />
          <Meta
            label="Schedule"
            value={
              agent.schedule ? `${agent.schedule}${agent.scheduleEnabled ? "" : " (off)"}` : "—"
            }
          />
          <Meta label="Working dir" value={agent.cwd ?? "~/MatrixDash"} />
          <Meta label="Allowlist" value={`${agent.writeAllowlist.length} path(s)`} />
          <Meta label="Push mode" value={agent.pushMode ?? "auto"} />
        </div>
      </Card>

      <h2 className="text-text-secondary mt-2 text-sm font-medium">Run history</h2>
      {runs === null ? (
        <div className="text-text-muted flex items-center gap-2 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-8 w-8" />}
          title="No runs yet"
          description="Run this agent to see its history here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((r) => (
            <Link key={r.id} href={`/dashboard/agents/runs/${r.id}`}>
              <Card className="hover:border-border flex items-center justify-between gap-3 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={STATUS_TONE[r.status] ?? "text-text-muted"}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                  <Badge className="text-text-muted bg-white/5">{r.trigger}</Badge>
                  {r.dryRun && <Badge className="text-text-muted bg-white/5">dry-run</Badge>}
                  {r.urgent && <Badge className="bg-rose-500/15 text-rose-300">urgent</Badge>}
                </div>
                <span className="text-text-muted text-xs">
                  {r.numTurns} turns · ${r.costUsd.toFixed(4)} ·{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-muted text-xs">{label}</div>
      <div className="truncate">{value}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Bot,
  Trash2,
  Pencil,
  Play,
  Loader2,
  ShieldAlert,
  Clock,
  History,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { AgentForm } from "@/components/agents/agent-form";
import type { AgentConfig } from "@/types/agents";

interface AgentListItem extends AgentConfig {
  lastRun: { id: string; status: string; createdAt: string; costUsd: number } | null;
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

export default function AgentsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<AgentListItem[] | null>(null);
  const [killSwitch, setKillSwitch] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AgentConfig | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [usage, setUsage] = useState<{
    cost: number;
    costBudget: number;
    costPct: number;
    runs: number;
  } | null>(null);
  const [cliMissing, setCliMissing] = useState(false);

  const load = useCallback(async () => {
    const [agentsRes, settingsRes, usageRes, onboardRes] = await Promise.all([
      fetch("/api/agents"),
      fetch("/api/settings"),
      fetch("/api/agents/usage"),
      fetch("/api/agents/onboarding"),
    ]);
    if (agentsRes.ok) setList((await agentsRes.json()) as AgentListItem[]);
    if (settingsRes.ok) {
      const s = (await settingsRes.json()) as Record<string, string>;
      setKillSwitch(s.agents_kill_switch === "1");
    }
    if (usageRes.ok) setUsage(await usageRes.json());
    if (onboardRes.ok) {
      const o = (await onboardRes.json()) as { cliFound: boolean };
      setCliMissing(!o.cliFound);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setKill(next: boolean) {
    setKillSwitch(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents_kill_switch: next }),
    });
    toast.info(next ? "Kill switch ON — all runs paused" : "Kill switch off");
  }

  async function toggleEnabled(agent: AgentListItem, next: boolean) {
    setList((l) => l?.map((a) => (a.id === agent.id ? { ...a, isEnabled: next } : a)) ?? null);
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: next }),
    });
  }

  async function runNow(agent: AgentListItem) {
    setRunningId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Run failed to start");
      }
      const { runId } = (await res.json()) as { runId: string };
      toast.success("Run started");
      window.location.href = `/dashboard/agents/runs/${runId}`;
    } catch (err) {
      toast.error("Could not start run", err instanceof Error ? err.message : undefined);
    } finally {
      setRunningId(null);
    }
  }

  async function remove(agent: AgentListItem) {
    const ok = await confirm({
      title: `Delete ${agent.name}?`,
      description: "This removes the agent and its run history. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Agent deleted");
      void load();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Could not delete", data.error);
    }
  }

  return (
    <div ref={ref} className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="display flex items-center gap-2 text-2xl">
            <Bot className="h-6 w-6" /> Agents
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            Autonomous agents with gated writes, approvals, and full audit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/agents/approvals">
            <Button variant="outline" size="sm">
              <ShieldAlert className="mr-1.5 h-4 w-4" /> Approvals
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New agent
          </Button>
        </div>
      </div>

      {cliMissing && (
        <Card className="border-amber-500/40 p-4 text-sm">
          <div className="font-medium text-amber-300">Claude CLI not found</div>
          <div className="text-text-muted mt-1 text-xs">
            Agents run on the Claude Agent SDK via your Claude subscription, which needs the{" "}
            <code>claude</code> CLI installed and logged in. On a headless host, run{" "}
            <code>claude setup-token</code>.
          </div>
        </Card>
      )}

      {/* Global kill switch */}
      <Card
        className={`flex items-center justify-between p-4 ${
          killSwitch ? "border-rose-500/50" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-5 w-5 ${killSwitch ? "text-rose-400" : "text-text-muted"}`} />
          <div>
            <div className="text-sm font-medium">Global kill switch</div>
            <div className="text-text-muted text-xs">
              {killSwitch ? "All runs are paused and active runs aborted." : "Agents run normally."}
            </div>
          </div>
        </div>
        <Switch checked={killSwitch} onCheckedChange={setKill} />
      </Card>

      {usage && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-text-muted">
              Today · {usage.runs} run{usage.runs === 1 ? "" : "s"}
            </span>
            <span className="text-text-muted" title="estimated (subscription auth)">
              ${usage.cost.toFixed(2)} / ${usage.costBudget.toFixed(2)} est.
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${usage.costPct > 90 ? "bg-rose-400" : usage.costPct > 70 ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${usage.costPct}%` }}
            />
          </div>
        </Card>
      )}

      {list === null ? (
        <div className="text-text-muted flex items-center gap-2 p-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title="No agents yet"
          description="Create your first agent, or enable one of the seeded templates."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((agent) => (
            <Card key={agent.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/agents/${agent.id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {agent.name}
                    </Link>
                    {agent.mode === "standing_watch" && (
                      <Badge className="bg-sky-500/15 text-sky-300">watching</Badge>
                    )}
                    {agent.schedule && agent.scheduleEnabled && (
                      <span className="text-text-muted inline-flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" /> {agent.schedule}
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted mt-0.5 truncate text-xs">{agent.description}</p>
                  {agent.lastRun && (
                    <p className="text-text-muted mt-1 text-xs">
                      last run{" "}
                      <span className={STATUS_TONE[agent.lastRun.status] ?? "text-text-muted"}>
                        {agent.lastRun.status.replace(/_/g, " ")}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={agent.isEnabled}
                    onCheckedChange={(v) => toggleEnabled(agent, v)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Run now"
                    disabled={!agent.isEnabled || killSwitch || runningId === agent.id}
                    onClick={() => runNow(agent)}
                  >
                    {runningId === agent.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Link href={`/dashboard/agents/${agent.id}`}>
                    <Button variant="ghost" size="icon" title="Run history">
                      <History className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    onClick={() => {
                      setEditing(agent);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(agent)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AgentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
}

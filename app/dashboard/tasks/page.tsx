"use client";

import { useCallback, useEffect, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Plus,
  Clock,
  Trash2,
  Play,
  CalendarClock,
  CheckSquare,
  Bot,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { Task, ScheduledJob } from "@/types/jarvis";

export default function TasksPage() {
  const ref = useGsapEntrance();
  const [tab, setTab] = useState<"todos" | "jobs">("todos");

  return (
    <div ref={ref} className="mx-auto max-w-3xl space-y-6 px-4 py-10 md:px-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative flex items-center justify-between">
          <div>
            <span className="eyebrow">
              <ListChecks size={11} /> Tasks &amp; Automations
            </span>
            <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">
              Tasks &amp; Automations
            </h1>
            <p className="text-text-secondary mt-2 text-sm">
              To-dos with reminders, plus scheduled jobs Jarvis runs for you.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-input flex w-fit items-center gap-1 rounded-md p-0.5">
        <TabButton
          active={tab === "todos"}
          onClick={() => setTab("todos")}
          icon={<CheckSquare size={13} />}
        >
          To-dos
        </TabButton>
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")} icon={<Bot size={13} />}>
          Scheduled jobs
        </TabButton>
      </div>

      {tab === "todos" ? <Todos /> : <Jobs />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-xs transition-colors",
        active ? "text-text-primary bg-white/10" : "text-text-muted hover:text-text-secondary"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Todos() {
  const [list, setList] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tasks");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        remindAt: remindAt ? new Date(remindAt).toISOString() : null,
      }),
    });
    setTitle("");
    setRemindAt("");
    refresh();
  };

  const toggle = async (t: Task) => {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDone: !t.isDone }),
    });
    refresh();
  };

  const remove = async (t: Task) => {
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card interactive className="space-y-3 rounded-2xl">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a to-do…"
        />
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2">
            <Clock size={13} className="text-text-muted" />
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="glass-input text-text-secondary h-9 flex-1 rounded-md px-2 text-xs"
            />
          </div>
          <Button variant="primary" size="sm" onClick={add} disabled={!title.trim()}>
            <Plus size={13} /> Add
          </Button>
        </div>
      </Card>

      {list === null ? null : list.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={16} />}
          title="No tasks"
          description="Add your first to-do above."
        />
      ) : (
        <Virtuoso
          useWindowScroll
          data={list}
          itemContent={(_, t) => (
            <Card
              className={cn(
                "mb-2 flex items-center gap-3 rounded-xl py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                t.isDone && "opacity-50"
              )}
            >
              <button
                onClick={() => toggle(t)}
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                  t.isDone
                    ? "border-emerald-400 bg-emerald-400"
                    : "border-white/20 hover:border-emerald-400"
                )}
                aria-label="Toggle done"
              >
                {t.isDone && <CheckSquare size={12} className="text-black" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-text-primary text-sm", t.isDone && "line-through")}>
                  {t.title}
                </p>
                {t.remindAt && (
                  <p className="text-text-muted mt-0.5 flex items-center gap-1 text-[10px]">
                    <Clock size={9} /> {new Date(t.remindAt).toLocaleString()}
                    {t.reminded && <span className="text-emerald-400">· reminded</span>}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(t)}
                className="text-text-muted shrink-0 hover:text-rose-400"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </Card>
          )}
        />
      )}
    </div>
  );
}

function Jobs() {
  const [list, setList] = useState<ScheduledJob[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cronExpr, setCronExpr] = useState("0 8 * * *");
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/jobs");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim() || !prompt.trim()) return;
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, prompt, cron: cronExpr }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(
        "Invalid job",
        typeof data.error === "string" ? data.error : "Check the cron expression."
      );
      return;
    }
    toast.success("Job scheduled");
    setName("");
    setPrompt("");
    setCronExpr("0 8 * * *");
    setOpen(false);
    refresh();
  };

  const runNow = async (j: ScheduledJob) => {
    setRunning(j.id);
    try {
      await fetch(`/api/jobs/${j.id}`, { method: "POST" });
      toast.success("Job ran", "Check notifications for the result.");
      refresh();
    } finally {
      setRunning(null);
    }
  };

  const toggle = async (j: ScheduledJob) => {
    await fetch(`/api/jobs/${j.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isEnabled: !j.isEnabled }),
    });
    refresh();
  };

  const remove = async (j: ScheduledJob) => {
    const ok = await confirm({
      title: `Delete "${j.name}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-text-secondary text-xs">
          Jobs run your prompt through the agent on a schedule (cron). Try a morning briefing.
        </p>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus size={13} /> New job
        </Button>
      </div>

      {list === null ? null : list.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={16} />}
          title="No scheduled jobs"
          description="e.g. 'Every day at 8am, summarize my unread email and today's calendar.'"
          action={
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              <Plus size={13} /> New job
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((j) => (
            <Card key={j.id} interactive className="space-y-2 rounded-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary text-sm font-medium">{j.name}</p>
                    <Badge className="font-mono">{j.cron}</Badge>
                  </div>
                  <p className="text-text-secondary mt-1 line-clamp-2 text-xs">{j.prompt}</p>
                  {j.lastRunAt && (
                    <p className="text-text-muted mt-1 text-[10px]">
                      last run {timeAgo(j.lastRunAt)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={!!j.isEnabled}
                    onCheckedChange={() => toggle(j)}
                    label="Enabled"
                  />
                </div>
              </div>
              {j.lastResult && (
                <p className="text-text-secondary line-clamp-3 rounded-md border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                  {j.lastResult}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runNow(j)}
                  disabled={running === j.id}
                >
                  <Play size={12} /> {running === j.id ? "Running…" : "Run now"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(j)}>
                  <Trash2 size={12} className="text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New scheduled job"
        description="The agent runs this prompt on a cron schedule."
      >
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Job name (e.g. Morning briefing)"
            autoFocus
          />
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Summarize my unread email and today's calendar, then list my open tasks."
          />
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              Cron schedule
            </label>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 8 * * *"
              className="font-mono"
            />
            <p className="text-text-muted mt-1 text-[10px]">
              <span className="font-mono">0 8 * * *</span> = daily 8am ·{" "}
              <span className="font-mono">*/30 * * * *</span> = every 30 min
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={!name.trim() || !prompt.trim()}>
              Schedule
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

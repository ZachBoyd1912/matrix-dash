"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import Link from "next/link";
import {
  Plus,
  MessageSquare,
  ArrowRight,
  Trash2,
  History,
  GitBranch,
  LayoutGrid,
  CornerDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { cn } from "@/lib/utils/cn";
import type { SessionWithCount } from "@/types/session";

/** Root sessions (no parent, or whose parent was deleted) with their forks nested beneath. */
function buildTree(sessions: SessionWithCount[]): Map<string | null, SessionWithCount[]> {
  const ids = new Set(sessions.map((s) => s.id));
  const byParent = new Map<string | null, SessionWithCount[]>();
  for (const s of sessions) {
    const parent = s.parentSessionId && ids.has(s.parentSessionId) ? s.parentSessionId : null;
    const list = byParent.get(parent) ?? [];
    list.push(s);
    byParent.set(parent, list);
  }
  return byParent;
}

export default function SessionsPage() {
  const ref = useGsapEntrance();
  const [sessions, setSessions] = useState<SessionWithCount[] | null>(null);
  const [viewMode, setViewMode] = useState<"flat" | "tree">("flat");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/sessions");
    setSessions(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ?new=1 deep link from the command palette.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      window.history.replaceState(null, "", "/dashboard/sessions");
      create();
    }
  }, []);

  const create = async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Session" }),
    });
    const data = await res.json();
    window.location.href = `/dashboard/sessions/${data.id}`;
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete this session?",
      description: "All of its messages will be deleted too.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    toast.success("Session deleted");
    refresh();
  };

  const byParent = useMemo(
    () => (sessions ? buildTree(sessions) : new Map<string | null, SessionWithCount[]>()),
    [sessions]
  );

  const renderCard = (s: SessionWithCount, depth = 0) => (
    <Card key={s.id} interactive className="group rounded-2xl">
      <Link href={`/dashboard/sessions/${s.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-text-primary flex items-center gap-1.5 truncate text-sm font-semibold">
              {depth > 0 && <CornerDownRight size={11} className="text-text-muted shrink-0" />}
              {s.name}
            </h3>
            <p className="text-text-muted mt-1 text-[11px]">
              {s.messageCount} {s.messageCount === 1 ? "message" : "messages"} ·{" "}
              {timeAgo(s.updatedAt)}
            </p>
          </div>
          <ArrowRight
            size={14}
            className="island-icon text-text-muted mt-1 shrink-0 transition-colors group-hover:text-emerald-400"
          />
        </div>
      </Link>
      <div className="mt-3 flex justify-end border-t border-white/5 pt-3">
        <button
          onClick={() => remove(s.id)}
          className="text-text-muted flex items-center gap-1 text-[11px] transition-colors hover:text-rose-400"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </Card>
  );

  // Recursive: a root/fork session followed by its own forks, indented one level.
  const renderBranch = (s: SessionWithCount, depth: number) => (
    <div
      key={s.id}
      style={depth > 0 ? { marginLeft: depth * 24 } : undefined}
      className="space-y-3"
    >
      {renderCard(s, depth)}
      {(byParent.get(s.id) ?? []).map((child) => renderBranch(child, depth + 1))}
    </div>
  );

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-8 px-4 py-10 md:px-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">
              <History size={11} /> Conversations
            </span>
            <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Sessions</h1>
            <p className="text-text-secondary mt-2 text-sm">
              Every conversation is stored locally — resume any thread.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-white/10 p-0.5">
              <button
                onClick={() => setViewMode("flat")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "flat"
                    ? "bg-white/10 text-emerald-300"
                    : "text-text-muted hover:text-text-primary"
                )}
                aria-label="Flat view"
                aria-pressed={viewMode === "flat"}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode("tree")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "tree"
                    ? "bg-white/10 text-emerald-300"
                    : "text-text-muted hover:text-text-primary"
                )}
                aria-label="Branch tree view"
                aria-pressed={viewMode === "tree"}
              >
                <GitBranch size={14} />
              </button>
            </div>
            <Button variant="primary" onClick={create}>
              <Plus size={14} /> New session
            </Button>
          </div>
        </div>
      </div>

      {sessions === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={16} />}
          title="No sessions yet"
          description="Start your first conversation."
          action={
            <Button variant="primary" onClick={create}>
              <Plus size={14} /> New session
            </Button>
          }
        />
      ) : viewMode === "tree" ? (
        <div className="space-y-4">
          {(byParent.get(null) ?? []).map((root) => renderBranch(root, 0))}
        </div>
      ) : (
        <VirtuosoGrid
          useWindowScroll
          data={sessions}
          listClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
          itemContent={(_, s) => renderCard(s)}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MessageSquare, ArrowRight, Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import { toast, confirm } from "@/lib/stores/use-feedback";
import type { SessionWithCount } from "@/types/session";

export default function SessionsPage() {
  const ref = useGsapEntrance();
  const [sessions, setSessions] = useState<SessionWithCount[] | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div ref={ref} className="px-4 md:px-8 py-10 max-w-5xl mx-auto space-y-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow"><History size={11} /> Conversations</span>
            <h1 className="display text-gradient text-4xl md:text-5xl mt-3">Sessions</h1>
            <p className="text-text-secondary text-sm mt-2">
              Every conversation is stored locally — resume any thread.
            </p>
          </div>
          <Button variant="primary" onClick={create}>
            <Plus size={14} /> New session
          </Button>
        </div>
      </div>

      {sessions === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={16} />}
          title="No sessions yet"
          description="Start your first conversation."
          action={<Button variant="primary" onClick={create}><Plus size={14} /> New session</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <Card key={s.id} interactive className="group rounded-2xl">
              <Link href={`/dashboard/sessions/${s.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary truncate">
                      {s.name}
                    </h3>
                    <p className="text-[11px] text-text-muted mt-1">
                      {s.messageCount} {s.messageCount === 1 ? "message" : "messages"} · {timeAgo(s.updatedAt)}
                    </p>
                  </div>
                  <ArrowRight size={14} className="island-icon text-text-muted group-hover:text-emerald-400 transition-colors mt-1 shrink-0" />
                </div>
              </Link>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                <button
                  onClick={() => remove(s.id)}
                  className="text-text-muted hover:text-rose-400 transition-colors text-[11px] flex items-center gap-1"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MessageSquare, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
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
    if (!confirm("Delete this session and all its messages?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="px-4 md:px-8 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="text-text-secondary text-sm mt-1">
            Every conversation is stored locally — resume any thread.
          </p>
        </div>
        <Button variant="primary" onClick={create}>
          <Plus size={14} /> New session
        </Button>
      </div>

      {sessions === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <Card key={s.id} className="group hover:-translate-y-[1px]">
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
                  <ArrowRight size={14} className="text-text-muted group-hover:text-emerald-400 transition-colors mt-1 shrink-0" />
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

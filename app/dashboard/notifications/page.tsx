"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

interface Notification {
  id: string;
  title: string;
  body: string;
  kind: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
}

type FilterKind = "all" | "agent" | "task" | "system" | "email";

const KIND_LABELS: Record<FilterKind, string> = {
  all: "All",
  agent: "Agents",
  task: "Tasks",
  system: "System",
  email: "Email",
};

const KIND_ICONS: Record<string, string> = {
  agent: "🟢",
  task: "🔵",
  system: "⚙️",
  email: "📧",
};

function groupByDate(notifs: Notification[]): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>();
  const now = new Date();
  for (const n of notifs) {
    const d = new Date(n.createdAt);
    let key: string;
    if (d.toDateString() === now.toDateString()) key = "Today";
    else if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString())
      key = "Yesterday";
    else key = d.toLocaleDateString();
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  return groups;
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[] | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");

  const refresh = useCallback(async function loadNotifications() {
    const res = await fetch("/api/notifications");
    if (res.ok) setNotifs(await res.json());
  }, []);

  useEffect(
    function loadOnMount() {
      refresh();
    },
    [refresh]
  );

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    refresh();
  }

  async function clearAll() {
    await fetch("/api/notifications", { method: "DELETE" });
    refresh();
  }

  const filtered = notifs?.filter((n) => filter === "all" || n.kind === filter) ?? [];
  const grouped = groupByDate(filtered);
  const unread = notifs?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="display text-gradient text-2xl md:text-3xl">Notifications</h1>
          {unread > 0 && <p className="text-text-muted mt-1 text-xs">{unread} unread</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <CheckCheck size={14} className="mr-1" /> Read all
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <Trash2 size={14} className="mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {(Object.entries(KIND_LABELS) as [FilterKind, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === k
                ? "bg-emerald-400/15 text-emerald-300"
                : "text-text-muted hover:text-text-secondary hover:bg-white/5"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {notifs === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Bell size={16} />}
          title="No notifications"
          description={
            filter !== "all"
              ? `No ${KIND_LABELS[filter].toLowerCase()} notifications yet.`
              : "You're all caught up."
          }
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-text-muted mb-2 px-1 text-[10px] font-medium tracking-wider uppercase">
                {date}
              </h3>
              <div className="space-y-1">
                {items.map((n) => (
                  <a
                    key={n.id}
                    href={n.href || undefined}
                    className={cn(
                      "flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-white/[0.04]",
                      !n.isRead && "bg-white/[0.03] ring-1 ring-white/5"
                    )}
                  >
                    <span className="mt-0.5 text-sm">{KIND_ICONS[n.kind] || "📌"}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", !n.isRead && "text-text-primary font-medium")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-text-muted mt-0.5 truncate text-xs">{n.body}</p>
                      )}
                      <p className="text-text-muted mt-1 text-[10px]">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

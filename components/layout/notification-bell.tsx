"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { Notification } from "@/types/jarvis";

const KIND_COLOR: Record<string, string> = {
  info: "bg-sky-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-rose-400",
  reminder: "bg-violet-400",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = () => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data: Notification[]) => Array.isArray(data) && setItems(data))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = items.filter((i) => !i.isRead).length;

  const markRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) markRead();
        }}
        className="relative h-8 w-8 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-emerald-400 text-black text-[9px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-[320px] glass-strong rounded-xl overflow-hidden z-50 animate-[fadeIn_160ms_ease-out]">
          <div className="flex items-center justify-between px-3 h-10 border-b border-white/5">
            <span className="text-xs font-semibold text-text-primary">Notifications</span>
            <button onClick={markRead} className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1">
              <Check size={11} /> Mark read
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-8">Nothing yet.</p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div className={cn("flex gap-2.5 px-3 py-2.5 border-b border-white/5", !n.isRead && "bg-white/[0.03]")}>
                    <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", KIND_COLOR[n.kind] ?? "bg-sky-400")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-text-primary">{n.title}</p>
                      {n.body && <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-text-muted mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

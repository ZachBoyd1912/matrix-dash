"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Topbar badge showing the count of pending agent approvals, on every dashboard
 * page. Polls every 30s. Hidden when nothing is pending.
 */
export function ApprovalBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/agents/approvals?count=1");
        if (!res.ok) return;
        const { count } = (await res.json()) as { count: number };
        if (alive) setCount(count);
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/dashboard/agents/approvals"
      className="relative grid h-8 w-8 place-items-center rounded-md text-amber-300 transition-colors hover:bg-white/5"
      aria-label={`${count} pending agent approval${count === 1 ? "" : "s"}`}
      title={`${count} pending agent approval${count === 1 ? "" : "s"}`}
    >
      <ShieldAlert size={15} />
      <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
        {count > 9 ? "9+" : count}
      </span>
    </Link>
  );
}

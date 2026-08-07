"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type State = "loading" | "online" | "offline" | "none";

const META: Record<Exclude<State, "loading">, { dot: string; label: string }> = {
  online: { dot: "bg-emerald-400", label: "Device online" },
  offline: { dot: "bg-rose-400", label: "Device offline — vault and project data may be stale" },
  none: { dot: "bg-white/25", label: "No device paired" },
};

/**
 * Glanceable device liveness. A silently dropped connection previously looked
 * identical to a healthy one from inside the dashboard — stale data presented
 * itself with full confidence. This makes "your Mac is not reachable" visible
 * on every page instead of only on Settings → Devices.
 */
export function DeviceStatus() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await (await fetch("/api/runner/devices")).json();
        if (cancelled) return;
        if (!Array.isArray(rows) || rows.length === 0) setState("none");
        else setState(rows.some((d: { online?: boolean }) => d.online) ? "online" : "offline");
      } catch {
        if (!cancelled) setState("offline");
      }
    };
    void poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Render nothing until the first poll resolves, rather than flashing a
  // misleading state on every page load.
  if (state === "loading") return null;
  const meta = META[state];

  return (
    <Link
      href="/dashboard/settings/devices"
      title={meta.label}
      aria-label={meta.label}
      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
    >
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
    </Link>
  );
}

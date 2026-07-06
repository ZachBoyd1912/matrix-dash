"use client";

import { Search, Sparkles, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/lib/stores/use-app-store";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/chat": "Chat",
  "/dashboard/memory-bank": "Memory Bank",
  "/dashboard/notes": "Notes",
  "/dashboard/email": "Email",
  "/dashboard/sessions": "Sessions",
  "/dashboard/ide": "IDE",
  "/dashboard/matrix-builder": "Matrix Builder",
  "/dashboard/console": "Console",
  "/dashboard/settings": "Settings",
};

export function Topbar() {
  const pathname = usePathname();
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);

  const title =
    TITLES[pathname] ||
    Object.entries(TITLES)
      .filter(([k]) => pathname.startsWith(k))
      .sort(([a], [b]) => b.length - a.length)[0]?.[1] ||
    "Matrix Dash";

  return (
    <header className="glass-strong relative sticky top-0 z-20 h-14">
      {/* Aurora bottom hairline */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent" />
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5 md:hidden"
            aria-label="Open navigation"
          >
            <Menu size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 to-sky-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
            <h1 className="text-text-primary text-sm font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setCommandOpen(true)}
            className="glass-input text-text-muted hover:text-text-primary hidden h-8 items-center gap-2 rounded-full pr-2 pl-3 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/15 sm:flex"
            aria-label="Open command palette"
          >
            <Search size={14} />
            <span>Search…</span>
            <kbd className="text-text-muted ml-1 inline-flex items-center gap-0.5 text-[10px]">
              <span className="rounded border border-white/5 bg-white/[0.06] px-1.5 py-0.5">⌘</span>
              <span className="rounded border border-white/5 bg-white/[0.06] px-1.5 py-0.5">K</span>
            </kbd>
          </button>
          <NotificationBell />
          <div className="relative grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-emerald-400/30 to-sky-400/30 shadow-[0_0_16px_-4px_rgba(52,211,153,0.5)]">
            <Sparkles size={13} className="text-emerald-300" />
          </div>
        </div>
      </div>
    </header>
  );
}

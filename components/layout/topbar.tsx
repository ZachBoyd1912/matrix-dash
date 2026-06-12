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
    <header className="sticky top-0 z-20 h-14 border-b border-white/5 glass-strong">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden h-8 w-8 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={16} />
          </button>
          <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-md glass-input text-xs text-text-muted hover:text-text-primary transition-colors"
            aria-label="Open command palette"
          >
            <Search size={14} />
            <span>Search…</span>
            <kbd className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-text-muted">
              <span className="px-1 rounded bg-white/5">⌘</span>
              <span className="px-1 rounded bg-white/5">K</span>
            </kbd>
          </button>
          <NotificationBell />
          <div className="h-8 w-8 grid place-items-center rounded-full bg-gradient-to-br from-emerald-400/30 to-sky-400/30 border border-white/10">
            <Sparkles size={13} className="text-emerald-300" />
          </div>
        </div>
      </div>
    </header>
  );
}

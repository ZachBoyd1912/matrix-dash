"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LogoMark } from "./logo";
import { NAV_ITEMS, isNavActive } from "./nav-items";
import { useAppStore } from "@/lib/stores/use-app-store";

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const providers = useAppStore((s) => s.providers);
  const activeId = useAppStore((s) => s.activeProviderId);
  const setActive = useAppStore((s) => s.setActiveProviderId);

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 h-screen shrink-0 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-[68px]" : "w-[244px]",
        "hidden md:flex"
      )}
    >
      <div className="glass-strong relative flex h-full w-full flex-col">
        {/* Accent edge — a hairline aurora down the right border. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-emerald-400/25 to-transparent" />

        <div className="flex h-14 items-center justify-between border-b border-white/5 px-3">
          <Link href="/dashboard" className="group flex items-center gap-2.5 overflow-hidden">
            <span className="relative grid shrink-0 place-items-center">
              <span className="absolute inset-0 rounded-lg bg-[#a8461f]/20 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-100" />
              <LogoMark size={24} className="relative" />
            </span>
            {!collapsed && (
              <span className="font-display text-text-primary text-[16px] whitespace-nowrap italic">
                Matrix Dash
              </span>
            )}
          </Link>
          <button
            onClick={toggle}
            className="text-text-muted hover:text-text-primary shrink-0 rounded-md p-1 transition-colors hover:bg-white/5"
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2.5 py-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={`nav-${item.href.split("/").pop()}`}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  active
                    ? "text-text-primary bg-gradient-to-r from-emerald-400/[0.14] via-emerald-400/[0.05] to-transparent"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
                )}
              >
                {active && (
                  <span className="absolute top-1/2 left-0 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                )}
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active
                      ? "scale-110 text-emerald-400"
                      : "group-hover:scale-105 group-hover:text-emerald-400/80"
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-white/5 p-3">
            <p className="text-text-muted mb-2.5 px-1 text-[9px] tracking-[0.22em] uppercase">
              Active Provider
            </p>
            {providers.length === 0 ? (
              <Link
                href="/dashboard/settings"
                className="text-text-secondary block rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5 hover:text-emerald-400"
              >
                + Add provider
              </Link>
            ) : (
              <div className="relative">
                <span className="pulse-dot pointer-events-none absolute top-1/2 left-2.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <select
                  value={activeId ?? ""}
                  onChange={(e) => setActive(e.target.value || null)}
                  className="glass-input text-text-primary h-8 w-full cursor-pointer appearance-none rounded-lg pr-2 pl-6 text-xs transition-colors hover:border-white/15"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

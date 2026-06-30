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
        "shrink-0 h-screen sticky top-0 z-30 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-[68px]" : "w-[244px]",
        "hidden md:flex"
      )}
    >
      <div className="glass-strong relative w-full h-full flex flex-col">
        {/* Accent edge — a hairline aurora down the right border. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-emerald-400/25 to-transparent" />

        <div className="flex items-center justify-between px-3 h-14 border-b border-white/5">
          <Link href="/dashboard" className="group flex items-center gap-2.5 overflow-hidden">
            <span className="relative grid place-items-center shrink-0">
              <span className="absolute inset-0 rounded-lg bg-emerald-400/25 blur-md opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
              <LogoMark size={24} className="relative" />
            </span>
            {!collapsed && (
              <span className="font-extrabold tracking-tight text-text-primary text-[15px] whitespace-nowrap">
                Matrix<span className="text-emerald-400">.</span>Dash
              </span>
            )}
          </Link>
          <button
            onClick={toggle}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors shrink-0"
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 px-3 h-9 rounded-lg text-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  active
                    ? "text-text-primary bg-gradient-to-r from-emerald-400/[0.14] via-emerald-400/[0.05] to-transparent"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2.5px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                )}
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active ? "text-emerald-400 scale-110" : "group-hover:text-emerald-400/80 group-hover:scale-105"
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-white/5 p-3">
            <p className="text-[9px] uppercase tracking-[0.22em] text-text-muted mb-2.5 px-1">
              Active Provider
            </p>
            {providers.length === 0 ? (
              <Link
                href="/dashboard/settings"
                className="block text-xs text-text-secondary hover:text-emerald-400 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                + Add provider
              </Link>
            ) : (
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <select
                  value={activeId ?? ""}
                  onChange={(e) => setActive(e.target.value || null)}
                  className="glass-input w-full text-xs pl-6 pr-2 h-8 rounded-lg text-text-primary appearance-none cursor-pointer hover:border-white/15 transition-colors"
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

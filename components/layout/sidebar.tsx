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
        "shrink-0 h-screen sticky top-0 z-30 transition-[width] duration-300 ease-out",
        collapsed ? "w-[64px]" : "w-[240px]",
        "hidden md:flex"
      )}
    >
      <div className="glass-strong border-r border-white/5 w-full flex flex-col">
        <div className="flex items-center justify-between px-3 h-14 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <LogoMark size={22} />
            {!collapsed && (
              <span className="font-extrabold tracking-tight text-text-primary">
                Matrix<span className="text-emerald-400">.</span>Dash
              </span>
            )}
          </Link>
          <button
            onClick={toggle}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors"
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-all duration-150 group",
                  active
                    ? "text-text-primary bg-white/[0.06]"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                )}
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    active ? "text-emerald-400" : "group-hover:text-emerald-400/80"
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2 px-1">
              Active Provider
            </p>
            {providers.length === 0 ? (
              <Link
                href="/dashboard/settings"
                className="block text-xs text-text-secondary hover:text-emerald-400 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors"
              >
                + Add provider
              </Link>
            ) : (
              <select
                value={activeId ?? ""}
                onChange={(e) => setActive(e.target.value || null)}
                className="glass-input w-full text-xs px-2 h-8 rounded-md text-text-primary appearance-none cursor-pointer"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV_ITEMS, isNavActive } from "./nav-items";
import { LogoMark } from "./logo";
import { useAppStore } from "@/lib/stores/use-app-store";
import { cn } from "@/lib/utils/cn";

/** Bottom tab bar (always visible on <md) + slide-in drawer for the full nav. */
export function MobileNav() {
  const pathname = usePathname();
  const open = useAppStore((s) => s.mobileNavOpen);
  const setOpen = useAppStore((s) => s.setMobileNavOpen);

  const primary = NAV_ITEMS.slice(0, 4);

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-white/5">
        <div className="grid grid-cols-5 h-14">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[9px] transition-colors",
                  active ? "text-emerald-400" : "text-text-muted"
                )}
              >
                <Icon size={17} />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[9px] transition-colors",
              open ? "text-emerald-400" : "text-text-muted"
            )}
            aria-label="More navigation"
          >
            <span className="grid place-items-center h-[17px]">
              <span className="flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
            </span>
            More
          </button>
        </div>
      </nav>

      {/* Drawer */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute left-0 top-0 bottom-0 w-[260px] glass-strong border-r border-white/5 flex flex-col animate-[drawerIn_220ms_cubic-bezier(0.32,0.72,0,1)]">
            <div className="flex items-center justify-between p-4 pb-3 shrink-0">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2"
              >
                <LogoMark size={22} />
                <span className="font-display italic text-text-primary text-[17px]">
                  Matrix Dash
                </span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors",
                      active
                        ? "text-text-primary bg-white/[0.06]"
                        : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                    )}
                  >
                    <Icon size={16} className={active ? "text-emerald-400" : ""} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STORAGE_PREFIX = "matrix-nav-group-";

interface NavGroupProps {
  id: string;
  label: string;
  icon: LucideIcon;
  /** True when the current route is inside this group — forces it open and highlights the header. */
  active: boolean;
  children: React.ReactNode;
  /** Sidebar collapsed to an icon-only rail — no room for a group header, so render children directly. */
  iconOnly?: boolean;
  compact?: boolean;
}

/**
 * Collapsible nav section shared by the main sidebar and the settings
 * sub-nav. Owns expand/collapse state (persisted per-group in localStorage,
 * matching this codebase's existing plain-localStorage convention rather
 * than adding Zustand persist middleware for one UI concern) and auto-opens
 * when the active route is inside it. Callers own their own item link
 * markup/styling — this component only owns the disclosure chrome.
 */
export function NavGroup({
  id,
  label,
  icon: Icon,
  active,
  children,
  iconOnly,
  compact,
}: NavGroupProps) {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [expanded, setExpanded] = useState(active);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) setExpanded(saved === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  if (iconOnly) return <>{children}</>;

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg px-3 transition-colors",
          compact ? "h-8 text-xs" : "h-9 text-sm",
          active
            ? "text-text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
        )}
      >
        <Icon
          size={compact ? 13 : 16}
          className={cn(
            "shrink-0",
            active ? "text-emerald-400" : "group-hover:text-emerald-400/80"
          )}
        />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronRight
          size={compact ? 12 : 14}
          className={cn(
            "text-text-muted shrink-0 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>
      {expanded && (
        <div className={cn("mt-0.5 space-y-0.5", compact ? "pl-4" : "pl-4")}>{children}</div>
      )}
    </div>
  );
}

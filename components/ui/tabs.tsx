"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabDef {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Segmented tab bar with roving arrow-key navigation. */
export function Tabs({ tabs, value, onValueChange, className }: TabsProps) {
  const id = useId();

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (idx + dir + tabs.length) % tabs.length;
    onValueChange(tabs[next].value);
    document.getElementById(`${id}-tab-${tabs[next].value}`)?.focus();
  };

  return (
    <div
      role="tablist"
      className={cn(
        "glass-input inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl p-1",
        className
      )}
    >
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            id={`${id}-tab-${t.value}`}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "border border-emerald-400/25 bg-emerald-400/15 text-emerald-200"
                : "text-text-secondary hover:text-text-primary border border-transparent"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

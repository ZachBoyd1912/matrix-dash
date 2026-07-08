"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface Item {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  trigger: React.ReactNode;
  items: Item[];
  align?: "start" | "end";
  className?: string;
}

/**
 * Lightweight hand-rolled menu, matching this codebase's no-radix convention
 * (see select.tsx/dialog.tsx). Keyboard: ArrowUp/Down move, Enter selects,
 * Escape closes; click-outside closes.
 */
export function DropdownMenu({ trigger, items, align = "end", className }: Props) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Move real DOM focus onto the active item — the highlight class alone is
  // visual-only and announces nothing to a screen reader, and Tab could escape
  // past an open menu without ever landing inside it. Only restore focus to
  // the trigger on an actual open→close transition, never on mount (open
  // starts false, and this effect must not steal focus from whatever else is
  // on the page the first time it runs).
  React.useEffect(() => {
    if (open) {
      itemRefs.current[active]?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
      wasOpen.current = false;
    }
  }, [open, active]);

  const enabled = items.map((it, i) => (!it.disabled ? i : -1)).filter((i) => i >= 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActive(enabled[0] ?? 0);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const pos = enabled.indexOf(active);
      const next = enabled[(pos + dir + enabled.length) % enabled.length];
      if (next !== undefined) setActive(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item && !item.disabled) {
        setOpen(false);
        item.onSelect();
      }
    }
  };

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "glass-strong absolute z-50 mt-1.5 min-w-[160px] rounded-xl border border-white/10 p-1 shadow-xl",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                item.danger ? "text-rose-400" : "text-text-primary",
                active === i && !item.disabled ? "bg-white/8" : "",
                item.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/8"
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

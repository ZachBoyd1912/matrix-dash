"use client";

import { useState } from "react";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  thinking: string;
  /** True while the model is still emitting reasoning — shows a live pulse. */
  active?: boolean;
}

/**
 * Collapsible reasoning trace shown above an assistant reply.
 * Auto-expands while reasoning is streaming, collapses once the answer starts.
 */
export function ThinkingBlock({ thinking, active }: Props) {
  const [open, setOpen] = useState(false);
  if (!thinking.trim()) return null;

  const chars = thinking.length;

  return (
    <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
      >
        <Brain size={12} className={cn("text-violet-300", active && "animate-pulse")} />
        <span className="font-medium">
          {active ? "Thinking…" : "Thought process"}
        </span>
        <span className="text-text-muted">· {chars} chars</span>
        <ChevronRight
          size={12}
          className={cn("ml-auto transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <pre className="px-3 pb-2.5 pt-0.5 text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
          {thinking}
        </pre>
      )}
    </div>
  );
}

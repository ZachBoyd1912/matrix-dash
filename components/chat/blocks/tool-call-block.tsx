"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Block, ToolStatus } from "@/lib/chat/blocks";

type ToolBlock = Extract<Block, { kind: "tool_call" }>;

/** The single status indicator (running spinner / emerald dot / rose x). */
export function StatusGlyph({ status }: { status: ToolStatus }) {
  if (status === "running")
    return <Loader2 size={12} className="shrink-0 animate-spin text-emerald-300" />;
  if (status === "error") return <span className="shrink-0 leading-none text-rose-400">✗</span>;
  return (
    <span className="shrink-0 leading-none text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.7)]">
      ●
    </span>
  );
}

/** Pull the most meaningful single argument to show in the header, Claude-Code style. */
function primaryArg(args: unknown): string {
  if (typeof args === "string") return args;
  if (!args || typeof args !== "object") return "";
  const o = args as Record<string, unknown>;
  for (const k of ["path", "file", "command", "query", "url", "pattern", "title", "name", "id"]) {
    if (typeof o[k] === "string") return o[k] as string;
  }
  const first = Object.values(o).find((v) => typeof v === "string");
  return typeof first === "string" ? first : "";
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * A single tool invocation rendered as a collapsible "● Tool(arg)" card — the
 * machined-glass family used by the artifact panel, scaled down for many-per-turn.
 *
 * `childBlocks` (subagent/Task runs) render as an indented mini-timeline inside
 * the card, so a subagent's tool calls are visible instead of arriving flattened
 * into the top-level transcript.
 */
export function ToolCallBlock({
  block,
  childBlocks,
}: {
  block: ToolBlock;
  childBlocks?: ToolBlock[];
}) {
  const [open, setOpen] = useState(false);
  const arg = primaryArg(block.args);
  const body = block.error ? block.error : toText(block.result);
  const hasChildren = !!childBlocks && childBlocks.length > 0;
  const hasBody = (!!body && block.status !== "running") || hasChildren;

  return (
    <div
      className={cn(
        "group my-1.5 overflow-hidden rounded-xl border bg-white/[0.02] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        block.status === "error" ? "border-rose-500/20" : "border-white/5 hover:border-white/10"
      )}
    >
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={cn(
          "text-text-secondary flex h-9 w-full items-center gap-2 px-3 font-mono text-[12px] transition-colors duration-200",
          hasBody ? "hover:text-text-primary cursor-pointer" : "cursor-default"
        )}
      >
        <StatusGlyph status={block.status} />
        <span className="text-text-primary">{block.name}</span>
        {arg && (
          <span className="truncate">
            <span className="text-text-muted">(</span>
            <span className="text-emerald-200/90">{arg}</span>
            <span className="text-text-muted">)</span>
          </span>
        )}
        {hasBody && (
          <ChevronRight
            size={12}
            className={cn(
              "ml-auto shrink-0 transition-transform duration-200",
              open && "rotate-90"
            )}
          />
        )}
      </button>
      {hasBody && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            {hasChildren && (
              <div className="mx-3 mb-2 space-y-1 border-l-2 border-sky-400/25 pl-3">
                {childBlocks!.map((c, i) => (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex items-center gap-2 font-mono text-[11px]"
                  >
                    <StatusGlyph status={c.status} />
                    <span className="text-text-secondary">{c.name}</span>
                    {primaryArg(c.args) && (
                      <span className="text-text-muted truncate">({primaryArg(c.args)})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!!body && (
              <pre
                className={cn(
                  "mx-3 mb-2.5 max-h-72 overflow-y-auto rounded-lg border-l-2 bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap",
                  block.status === "error"
                    ? "border-rose-500/40 text-rose-300/90"
                    : "text-text-muted border-emerald-400/30"
                )}
              >
                {body}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { ClipboardList, Check, Pencil } from "lucide-react";
import { Markdown } from "../markdown";
import type { Block } from "@/lib/chat/blocks";

type ToolBlock = Extract<Block, { kind: "tool_call" }>;

/** Pull the plan markdown out of an ExitPlanMode tool_use's args. */
function planText(args: unknown): string {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const o = args as Record<string, unknown>;
    if (typeof o.plan === "string") return o.plan;
  }
  return "";
}

/**
 * The plan the CLI produced in plan mode (ExitPlanMode tool_use), rendered as a
 * reviewable card — terminal parity for Claude Code's plan-approval gate.
 * Approve sends the go-ahead as the next turn (with plan mode off); "Keep
 * planning" leaves plan mode on so the next message iterates the plan.
 */
export function PlanCard({
  block,
  onDecision,
}: {
  block: ToolBlock;
  onDecision?: (approved: boolean) => void;
}) {
  const plan = planText(block.args);

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-sky-400/25 bg-sky-400/[0.05]">
      <div className="flex h-9 items-center gap-2 border-b border-sky-400/15 px-3 font-mono text-[12px] text-sky-200">
        <ClipboardList size={13} className="shrink-0" />
        Plan ready for review
      </div>
      <div className="max-h-96 overflow-y-auto px-4 py-3 text-sm">
        {plan ? <Markdown content={plan} /> : <span className="text-text-muted">Empty plan.</span>}
      </div>
      {onDecision && (
        <div className="flex items-center gap-2 border-t border-sky-400/15 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onDecision(true)}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-semibold text-black transition-colors hover:bg-emerald-300"
          >
            <Check size={13} /> Approve & build
          </button>
          <button
            type="button"
            onClick={() => onDecision(false)}
            className="text-text-secondary hover:text-text-primary flex h-7 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs transition-colors hover:border-white/20"
          >
            <Pencil size={13} /> Keep planning
          </button>
        </div>
      )}
    </div>
  );
}

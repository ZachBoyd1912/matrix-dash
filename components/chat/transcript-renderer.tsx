"use client";

import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallBlock } from "./blocks/tool-call-block";
import { ApprovalCard } from "./blocks/approval-card";
import { PlanCard } from "./blocks/plan-card";
import type { Block, ApprovalDecision } from "@/lib/chat/blocks";

type ToolBlock = Extract<Block, { kind: "tool_call" }>;

/**
 * Renders an assistant turn's ordered `Block[]` as an interleaved Claude-Code-style
 * timeline. Text → Markdown, reasoning → ThinkingBlock, tool_call → ToolCallBlock.
 *
 * Subagent nesting: tool_call blocks carrying `parentId` (raised inside a Task
 * subagent) are pulled out of the top-level flow and rendered indented under
 * their parent Task's card — terminal-parity subagent visibility.
 *
 * ExitPlanMode tool calls render as a PlanCard with Approve / Keep-planning
 * actions (plan mode), wired through `onPlanDecision`.
 */
export function TranscriptRenderer({
  blocks,
  streaming,
  onApprove,
  onPlanDecision,
}: {
  blocks: Block[];
  streaming?: boolean;
  onApprove?: (id: string, decision: ApprovalDecision) => void;
  onPlanDecision?: (approved: boolean) => void;
}) {
  const lastIndex = blocks.length - 1;

  // Group subagent children under their parent Task id; top-level keeps order.
  const childrenOf = new Map<string, ToolBlock[]>();
  for (const b of blocks) {
    if (b.kind === "tool_call" && b.parentId) {
      const list = childrenOf.get(b.parentId) ?? [];
      list.push(b);
      childrenOf.set(b.parentId, list);
    }
  }

  // Empty assistant placeholder while the first token is in flight.
  if (blocks.length === 0) {
    return streaming ? (
      <span className="text-text-muted inline-flex items-center gap-1.5 text-[11px]">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
        Working…
      </span>
    ) : null;
  }

  return (
    <div className="space-y-1">
      {blocks.map((block, i) => {
        const isLast = i === lastIndex;
        switch (block.kind) {
          case "text":
            return (
              <div key={i} className="relative">
                <Markdown content={block.text} />
                {streaming && isLast && block.text && (
                  <span className="-mb-0.5 ml-0.5 inline-block h-3 w-[6px] animate-pulse rounded-sm bg-emerald-400" />
                )}
              </div>
            );
          case "reasoning":
            return <ThinkingBlock key={i} thinking={block.text} active={!!streaming && isLast} />;
          case "tool_call":
            // Children render inside their parent's card, not at top level.
            if (block.parentId) return null;
            if (block.name === "ExitPlanMode")
              return (
                <PlanCard
                  key={`${block.id}-${i}`}
                  block={block}
                  onDecision={isLast || streaming ? onPlanDecision : undefined}
                />
              );
            return (
              <ToolCallBlock
                key={`${block.id}-${i}`}
                block={block}
                childBlocks={childrenOf.get(block.id)}
              />
            );
          case "approval":
            return (
              <ApprovalCard
                key={`${block.id}-${i}`}
                block={block}
                onDecide={onApprove ?? (() => {})}
              />
            );
          case "error":
            return (
              <div
                key={i}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                {block.text}
              </div>
            );
          default:
            return null; // todo — rendered in later phases
        }
      })}
    </div>
  );
}

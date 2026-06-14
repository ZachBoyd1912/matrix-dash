"use client";

import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallBlock } from "./blocks/tool-call-block";
import { ApprovalCard } from "./blocks/approval-card";
import type { Block, ApprovalDecision } from "@/lib/chat/blocks";

/**
 * Renders an assistant turn's ordered `Block[]` as an interleaved Claude-Code-style
 * timeline. Text → Markdown, reasoning → ThinkingBlock, tool_call → ToolCallBlock.
 * todo/approval blocks are wired in later phases (no-op until then). Non-tool models
 * emit only text/reasoning blocks, so this renders identically to the old flat view.
 */
export function TranscriptRenderer({
  blocks,
  streaming,
  onApprove,
}: {
  blocks: Block[];
  streaming?: boolean;
  onApprove?: (id: string, decision: ApprovalDecision) => void;
}) {
  const lastIndex = blocks.length - 1;

  // Empty assistant placeholder while the first token is in flight.
  if (blocks.length === 0) {
    return streaming ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
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
                  <span className="inline-block w-[6px] h-3 -mb-0.5 ml-0.5 bg-emerald-400 rounded-sm animate-pulse" />
                )}
              </div>
            );
          case "reasoning":
            return <ThinkingBlock key={i} thinking={block.text} active={!!streaming && isLast} />;
          case "tool_call":
            return <ToolCallBlock key={block.id} block={block} />;
          case "approval":
            return <ApprovalCard key={block.id} block={block} onDecide={onApprove ?? (() => {})} />;
          case "error":
            return (
              <div
                key={i}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs px-3 py-2"
              >
                {block.text}
              </div>
            );
          default:
            return null; // todo / approval — rendered in later phases
        }
      })}
    </div>
  );
}

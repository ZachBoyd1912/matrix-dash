"use client";

import { TranscriptRenderer } from "./transcript-renderer";
import { blocksToText, type Block, type ApprovalDecision } from "@/lib/chat/blocks";
import { cn } from "@/lib/utils/cn";
import { Sparkles, User, RotateCw, GitFork, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  role: "user" | "assistant" | "system";
  blocks: Block[];
  streaming?: boolean;
  onApprove?: (id: string, decision: ApprovalDecision) => void;
  /** Plan-mode gate (claude-code mode): approve or keep iterating the plan. */
  onPlanDecision?: (approved: boolean) => void;
  /** Set when the fallback cascade served this turn from a non-primary provider. */
  fallbackNotice?: string;
  /** Which regenerated variant is currently shown (0-based). */
  variantIndex?: number;
  /** Total variant count — the picker only renders when this is > 1. */
  variantCount?: number;
  /** Re-run this assistant turn. Omitted (no session, or a stream in flight) hides the action. */
  onRegenerate?: () => void;
  /** Start a new session containing everything up to and including this message. */
  onFork?: () => void;
  onSwitchVariant?: (index: number) => void;
}

export function MessageBubble({
  role,
  blocks,
  streaming,
  onApprove,
  onPlanDecision,
  fallbackNotice,
  variantIndex,
  variantCount,
  onRegenerate,
  onFork,
  onSwitchVariant,
}: Props) {
  if (role === "system") return null;

  const isUser = role === "user";
  const showVariantPicker = !isUser && (variantCount ?? 0) > 1 && onSwitchVariant;
  const showActions = !streaming && (onRegenerate || onFork);

  return (
    <div className={cn("group flex w-full gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-emerald-400/30 to-sky-400/20 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-emerald-400/30">
          <Sparkles size={13} className="text-emerald-300" />
        </div>
      )}
      <div className={cn("max-w-[78%] min-w-0", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isUser
              ? "text-text-primary rounded-tr-sm border border-emerald-400/30 bg-emerald-400/15 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
              : "glass rounded-tl-sm border border-white/5"
          )}
        >
          {isUser ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {blocksToText(blocks)}
            </div>
          ) : (
            <TranscriptRenderer
              blocks={blocks}
              streaming={streaming}
              onApprove={onApprove}
              onPlanDecision={onPlanDecision}
            />
          )}
        </div>
        {!isUser && fallbackNotice && (
          <p className="text-text-muted mt-1.5 pl-1 text-[11px]">{fallbackNotice}</p>
        )}
        {(showActions || showVariantPicker) && (
          <div className="mt-1.5 flex items-center gap-2 pl-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {showVariantPicker && (
              <div className="text-text-muted flex items-center gap-1 text-[11px]">
                <button
                  onClick={() => onSwitchVariant!((variantIndex ?? 0) - 1)}
                  disabled={(variantIndex ?? 0) <= 0}
                  className="hover:text-text-primary rounded p-0.5 disabled:opacity-30"
                  aria-label="Previous variant"
                >
                  <ChevronLeft size={12} />
                </button>
                <span>
                  {(variantIndex ?? 0) + 1}/{variantCount}
                </span>
                <button
                  onClick={() => onSwitchVariant!((variantIndex ?? 0) + 1)}
                  disabled={(variantIndex ?? 0) >= (variantCount ?? 1) - 1}
                  className="hover:text-text-primary rounded p-0.5 disabled:opacity-30"
                  aria-label="Next variant"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-text-muted hover:text-text-primary flex items-center gap-1 text-[11px] transition-colors"
                aria-label="Regenerate response"
              >
                <RotateCw size={11} /> Regenerate
              </button>
            )}
            {onFork && (
              <button
                onClick={onFork}
                className="text-text-muted hover:text-text-primary flex items-center gap-1 text-[11px] transition-colors"
                aria-label="Fork from here"
              >
                <GitFork size={11} /> Fork from here
              </button>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-white/20">
          <User size={13} className="text-text-secondary" />
        </div>
      )}
    </div>
  );
}

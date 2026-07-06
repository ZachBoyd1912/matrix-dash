"use client";

import { TranscriptRenderer } from "./transcript-renderer";
import { blocksToText, type Block, type ApprovalDecision } from "@/lib/chat/blocks";
import { cn } from "@/lib/utils/cn";
import { Sparkles, User } from "lucide-react";

interface Props {
  role: "user" | "assistant" | "system";
  blocks: Block[];
  streaming?: boolean;
  onApprove?: (id: string, decision: ApprovalDecision) => void;
}

export function MessageBubble({ role, blocks, streaming, onApprove }: Props) {
  if (role === "system") return null;

  const isUser = role === "user";

  return (
    <div className={cn("group flex w-full gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-emerald-400/30 to-sky-400/20 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-emerald-400/30">
          <Sparkles size={13} className="text-emerald-300" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isUser
            ? "text-text-primary rounded-tr-sm border border-emerald-400/30 bg-emerald-400/15 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
            : "glass rounded-tl-sm border border-white/5"
        )}
      >
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{blocksToText(blocks)}</div>
        ) : (
          <TranscriptRenderer blocks={blocks} streaming={streaming} onApprove={onApprove} />
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

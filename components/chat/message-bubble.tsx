"use client";

import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import { cn } from "@/lib/utils/cn";
import { Sparkles, User } from "lucide-react";

interface Props {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  streaming?: boolean;
}

export function MessageBubble({ role, content, thinking, streaming }: Props) {
  if (role === "system") return null;

  const isUser = role === "user";
  // While streaming with no answer text yet, the reasoning is the "live" part.
  const thinkingActive = !!streaming && !content;

  return (
    <div className={cn("group flex gap-3 w-full", isUser && "justify-end")}>
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-lg grid place-items-center bg-gradient-to-br from-emerald-400/30 to-sky-400/20 border border-white/10 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-emerald-400/30">
          <Sparkles size={13} className="text-emerald-300" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isUser
            ? "bg-emerald-400/15 border border-emerald-400/30 text-text-primary rounded-tr-sm shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
            : "glass rounded-tl-sm border border-white/5"
        )}
      >
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
        ) : (
          <>
            {thinking ? <ThinkingBlock thinking={thinking} active={thinkingActive} /> : null}
            {thinkingActive && !thinking && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />
                Thinking…
              </span>
            )}
            <Markdown content={content || (streaming && !thinkingActive ? " " : "")} />
            {streaming && content && (
              <span className="inline-block w-[6px] h-3 -mb-0.5 ml-0.5 bg-emerald-400 rounded-sm animate-pulse" />
            )}
          </>
        )}
      </div>
      {isUser && (
        <div className="h-7 w-7 shrink-0 rounded-lg grid place-items-center bg-white/5 border border-white/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-white/20">
          <User size={13} className="text-text-secondary" />
        </div>
      )}
    </div>
  );
}

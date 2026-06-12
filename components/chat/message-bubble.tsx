"use client";

import { Markdown } from "./markdown";
import { cn } from "@/lib/utils/cn";
import { Sparkles, User } from "lucide-react";

interface Props {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}

export function MessageBubble({ role, content, streaming }: Props) {
  if (role === "system") return null;

  const isUser = role === "user";

  return (
    <div className={cn("flex gap-3 w-full", isUser && "justify-end")}>
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-md grid place-items-center bg-gradient-to-br from-emerald-400/30 to-sky-400/20 border border-white/10">
          <Sparkles size={13} className="text-emerald-300" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 transition-shadow",
          isUser
            ? "bg-emerald-400/15 border border-emerald-400/20 text-text-primary rounded-tr-sm"
            : "glass rounded-tl-sm"
        )}
      >
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
        ) : (
          <>
            <Markdown content={content || (streaming ? " " : "")} />
            {streaming && (
              <span className="inline-block w-[6px] h-3 -mb-0.5 ml-0.5 bg-emerald-400 rounded-sm animate-pulse" />
            )}
          </>
        )}
      </div>
      {isUser && (
        <div className="h-7 w-7 shrink-0 rounded-md grid place-items-center bg-white/5 border border-white/10">
          <User size={13} className="text-text-secondary" />
        </div>
      )}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useAppStore } from "@/lib/stores/use-app-store";
import { ChatInterface } from "@/components/chat/chat-interface";

// Client-only: the gate touches localStorage and polls the server lifecycle.
const CodeServerGate = dynamic(() => import("@/components/ide/code-server-gate"), { ssr: false });

export default function ChatPage() {
  const useClaudeCode = useAppStore((s) => s.useClaudeCode);
  const setUseClaudeCode = useAppStore((s) => s.setUseClaudeCode);

  // Claude Code engine → embed the REAL Claude Code extension (full feature set:
  // slash commands, model/effort/thinking, MCP, agents, hooks, output styles,
  // plugins, usage, context). It runs in the same code-server that the Process
  // Wrapper points at Matrix's proxy, so it uses the active Matrix model.
  if (useClaudeCode) {
    return (
      <div className="page-h flex flex-col min-h-0 bg-[#0d0d0d]">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/claude-logo.svg" alt="" className="h-4 w-4" />
            <span className="text-xs font-medium text-[#e8e6e3]">Claude Code</span>
            <span className="hidden md:inline text-[11px] text-text-muted truncate">
              real engine · runs on your active Matrix model · open the ✳ Claude Code panel inside
            </span>
          </div>
          <button
            onClick={() => setUseClaudeCode(false)}
            className="text-[11px] text-text-muted hover:text-text-primary px-2 h-7 rounded-md hover:bg-white/5 transition-colors shrink-0"
          >
            Use Matrix chat
          </button>
        </div>
        <div className="flex-1 min-h-0 [&>div]:!h-full">
          <CodeServerGate />
        </div>
      </div>
    );
  }

  return (
    <div className="page-h">
      <ChatInterface />
    </div>
  );
}

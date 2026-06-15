"use client";

import type { ReactNode } from "react";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[12px] leading-none text-[#cfcdc9] mx-0.5">
      {children}
    </kbd>
  );
}

/**
 * The Claude Code empty state, rebuilt with the REAL extension assets (clawd.svg
 * mascot + claude-logo.svg burst, copied from the installed Claude Code extension)
 * so it matches the actual CLI start screen: clay wordmark at the top, the Clawd
 * pixel mascot centered, the Shift+Tab hint, and the chat input at the bottom.
 */
export function ClaudeCodeEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d]">
      <div className="pt-8 flex items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/claude-logo.svg" alt="" className="h-[18px] w-[18px]" />
        <span className="font-serif text-xl text-[#e8e6e3] tracking-tight">Claude Code</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/clawd.svg" alt="Clawd" className="w-[120px] h-auto" />
        <p className="text-[15px] text-[#8a8782] text-center leading-relaxed">
          Press <Kbd>Shift</Kbd> <Kbd>Tab</Kbd> to automatically approve
          <br />
          code edits
        </p>
      </div>
      <div className="pb-8">{children}</div>
    </div>
  );
}

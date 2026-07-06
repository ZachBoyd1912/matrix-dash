"use client";

import type { ReactNode } from "react";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex items-center rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[12px] leading-none text-[#cfcdc9]">
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
    <div className="flex min-h-0 flex-1 flex-col bg-[#0d0d0d]">
      <div className="flex items-center justify-center gap-2 pt-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/claude-logo.svg" alt="" className="h-[18px] w-[18px]" />
        <span className="font-serif text-xl tracking-tight text-[#e8e6e3]">Claude Code</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/clawd.svg" alt="Clawd" className="h-auto w-[120px]" />
        <p className="text-center text-[15px] leading-relaxed text-[#8a8782]">
          Press <Kbd>Shift</Kbd> <Kbd>Tab</Kbd> to automatically approve
          <br />
          code edits
        </p>
      </div>
      <div className="pb-8">{children}</div>
    </div>
  );
}

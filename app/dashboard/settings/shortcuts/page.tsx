"use client";

import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { Keyboard } from "lucide-react";

const SHORTCUTS: { keys: string[]; action: string; context: string }[] = [
  { keys: ["⌘", "K"], action: "Open command palette", context: "Everywhere" },
  { keys: ["Esc"], action: "Close dialog / palette", context: "Everywhere" },
  { keys: ["Enter"], action: "Send message", context: "Chat" },
  { keys: ["Shift", "Enter"], action: "New line", context: "Chat" },
  { keys: ["⌘", "S"], action: "Save current file", context: "IDE" },
];

export default function ShortcutsPage() {
  const ref = useGsapEntrance();
  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb top-0 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Keyboard size={11} /> Keyboard
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl mt-3">
            Keyboard shortcuts
          </h1>
          <p className="text-text-secondary text-sm mt-3">
            Everything reachable without leaving the keyboard.
          </p>
        </div>
      </div>
      <Card interactive className="divide-y divide-white/5 p-0 rounded-2xl">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.action}
            className="flex items-center justify-between px-5 py-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.02]"
          >
            <div>
              <p className="text-sm text-text-primary">{shortcut.action}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mt-0.5">
                {shortcut.context}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="min-w-7 h-7 px-2 grid place-items-center rounded-lg bg-white/5 border border-white/10 text-xs text-text-secondary font-mono"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

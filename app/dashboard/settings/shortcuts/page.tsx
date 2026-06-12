"use client";

import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

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
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Keyboard shortcuts</h2>
        <p className="text-text-secondary text-sm mt-1">
          Everything reachable without leaving the keyboard.
        </p>
      </div>
      <Card className="divide-y divide-white/5 p-0">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.action} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-text-primary">{shortcut.action}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mt-0.5">
                {shortcut.context}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="min-w-7 h-7 px-2 grid place-items-center rounded-md bg-white/5 border border-white/10 text-xs text-text-secondary font-mono"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Paperclip, AtSign } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/lib/stores/use-app-store";

interface Props {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSubmit, onCancel, busy, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const providers = useAppStore((s) => s.providers);
  const activeId = useAppStore((s) => s.activeProviderId);
  const setActive = useAppStore((s) => s.setActiveProviderId);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(200, ref.current.scrollHeight)}px`;
  }, [value]);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || busy) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="glass-strong rounded-2xl p-3 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Message Matrix Dash…"}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent resize-none text-sm text-text-primary placeholder:text-text-muted focus:outline-none px-2 py-2 min-h-[40px] max-h-[200px]"
        />
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled
              className="h-7 w-7 grid place-items-center rounded-md text-text-muted/60 cursor-not-allowed"
              aria-label="Attach (coming soon)"
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              disabled
              className="h-7 w-7 grid place-items-center rounded-md text-text-muted/60 cursor-not-allowed"
              aria-label="Mention (coming soon)"
            >
              <AtSign size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {providers.length > 0 ? (
              <select
                value={activeId ?? ""}
                onChange={(e) => setActive(e.target.value || null)}
                className="glass-input text-xs h-7 px-2 rounded-md text-text-secondary"
                aria-label="Provider"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-text-muted">No provider configured</span>
            )}
            {busy ? (
              <button
                onClick={onCancel}
                className="h-8 w-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 text-text-primary transition-colors"
                aria-label="Stop"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={disabled || !value.trim()}
                className={cn(
                  "h-8 w-8 grid place-items-center rounded-full transition-all duration-150 active:scale-95",
                  value.trim()
                    ? "bg-emerald-400 text-black shadow-[0_0_20px_-4px_rgba(52,211,153,0.6)] hover:bg-emerald-300"
                    : "bg-white/10 text-text-muted cursor-not-allowed"
                )}
                aria-label="Send"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-[10px] text-text-muted mt-2">
        Matrix Dash extracts memories silently after every reply.
      </p>
    </div>
  );
}

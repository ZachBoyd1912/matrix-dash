"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Paperclip, Mic, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/lib/stores/use-app-store";
import { useSpeechInput } from "@/lib/hooks/use-voice";
import { ModelSelector } from "./model-selector";

interface Props {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  onAttach?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSubmit, onCancel, onAttach, busy, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const providers = useAppStore((s) => s.providers);
  const activeId = useAppStore((s) => s.activeProviderId);
  const setActive = useAppStore((s) => s.setActiveProviderId);
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const autoSpeak = useAppStore((s) => s.autoSpeak);
  const setAutoSpeak = useAppStore((s) => s.setAutoSpeak);
  const { listening, supported: micSupported, toggle: toggleMic } = useSpeechInput((text) =>
    setValue((v) => (v ? `${v} ${text}` : text))
  );

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
      <div className="group glass-input rounded-2xl p-3 border border-white/10 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:border-emerald-400/30 focus-within:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_-8px_rgba(52,211,153,0.5)]">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Message Matrix Dash…"}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent resize-none text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none px-2 py-2 min-h-[40px] max-h-[200px] disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-1">
            {onAttach && (
              <button
                type="button"
                onClick={onAttach}
                className="h-7 w-7 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
                aria-label="Attach file"
              >
                <Paperclip size={14} />
              </button>
            )}
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={cn(
                  "h-7 w-7 grid place-items-center rounded-md transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                  listening
                    ? "text-rose-400 bg-rose-400/10 animate-pulse"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5"
                )}
                aria-label={listening ? "Stop listening" : "Speak"}
              >
                <Mic size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={cn(
                "h-7 w-7 grid place-items-center rounded-md transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                autoSpeak
                  ? "text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              )}
              aria-label={autoSpeak ? "Mute replies" : "Speak replies"}
              title={autoSpeak ? "Replies spoken aloud" : "Speak replies aloud"}
            >
              {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center glass-input rounded-full p-0.5 text-[10px] border border-white/5">
              {(["chat", "agent"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setChatMode(mode)}
                  className={cn(
                    "h-6 px-2.5 rounded-full capitalize transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                    chatMode === mode
                      ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                      : "text-text-muted hover:text-text-secondary"
                  )}
                  title={mode === "agent" ? "Agent tools configurable in Settings → Agent Tools" : "Plain conversation"}
                >
                  {mode}
                </button>
              ))}
            </div>
            {providers.length > 0 ? (
              <>
                <select
                  value={activeId ?? ""}
                  onChange={(e) => setActive(e.target.value || null)}
                  className="glass-input text-xs h-7 px-2 rounded-md text-text-secondary border border-white/5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/10 focus:outline-none focus:border-emerald-400/30 focus:shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                  aria-label="Provider"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ModelSelector />
              </>
            ) : (
              <span className="text-[11px] text-text-muted">No provider configured</span>
            )}
            {busy ? (
              <button
                onClick={onCancel}
                className="h-8 w-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 text-text-primary border border-white/5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
                aria-label="Stop"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={disabled || !value.trim()}
                className={cn(
                  "h-8 w-8 grid place-items-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                  value.trim()
                    ? "bg-emerald-400 text-black shadow-[0_0_22px_-4px_rgba(52,211,153,0.7)] hover:bg-emerald-300"
                    : "bg-white/10 text-text-muted border border-white/5 cursor-not-allowed"
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

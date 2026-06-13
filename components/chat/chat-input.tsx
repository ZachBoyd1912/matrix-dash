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
            {onAttach && (
              <button
                type="button"
                onClick={onAttach}
                className="h-7 w-7 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
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
                  "h-7 w-7 grid place-items-center rounded-md transition-colors",
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
                "h-7 w-7 grid place-items-center rounded-md transition-colors",
                autoSpeak ? "text-emerald-400 bg-emerald-400/10" : "text-text-muted hover:text-text-primary hover:bg-white/5"
              )}
              aria-label={autoSpeak ? "Mute replies" : "Speak replies"}
              title={autoSpeak ? "Replies spoken aloud" : "Speak replies aloud"}
            >
              {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center glass-input rounded-full p-0.5 text-[10px]">
              {(["chat", "agent"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setChatMode(mode)}
                  className={cn(
                    "h-6 px-2.5 rounded-full capitalize transition-colors",
                    chatMode === mode
                      ? "bg-emerald-400/20 text-emerald-300"
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
                  className="glass-input text-xs h-7 px-2 rounded-md text-text-secondary"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Paperclip, Mic, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/lib/stores/use-app-store";
import { useSpeechInput } from "@/lib/hooks/use-voice";
import { ModelSelector } from "./model-selector";
import { SLASH_COMMANDS } from "@/lib/chat/slash-commands";

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
  const useClaudeCode = useAppStore((s) => s.useClaudeCode);
  const setUseClaudeCode = useAppStore((s) => s.setUseClaudeCode);
  const autoSpeak = useAppStore((s) => s.autoSpeak);
  const setAutoSpeak = useAppStore((s) => s.setAutoSpeak);
  const { listening, supported: micSupported, toggle: toggleMic } = useSpeechInput((text) =>
    setValue((v) => (v ? `${v} ${text}` : text))
  );

  // Slash-command menu: opens while the input is a bare "/command" (no space yet).
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashQuery =
    value.startsWith("/") && !value.includes(" ") && !value.includes("\n") ? value.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery !== null ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery)) : [];
  const showSlash = slashOpen && slashMatches.length > 0;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(200, ref.current.scrollHeight)}px`;
  }, [value]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    if (v.startsWith("/") && !v.includes(" ") && !v.includes("\n")) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const selectSlash = (name: string) => {
    setValue(`/${name} `);
    setSlashOpen(false);
    ref.current?.focus();
  };

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || busy) return;
    onSubmit(trimmed);
    setValue("");
    setSlashOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash) {
      const n = slashMatches.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % n);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + n) % n);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlash(slashMatches[Math.min(slashIndex, n - 1)].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 relative">
      {showSlash && (
        <div className="absolute bottom-full left-4 right-4 mb-2 z-50 rounded-xl border border-white/10 bg-[#0f0f0f]/95 backdrop-blur-md shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)] overflow-hidden py-1">
          {slashMatches.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => selectSlash(c.name)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors duration-150",
                i === Math.min(slashIndex, slashMatches.length - 1) ? "bg-emerald-400/10" : "hover:bg-white/5"
              )}
            >
              <span className="font-mono text-[12px] text-emerald-300">/{c.name}</span>
              <span className="text-[11px] text-text-muted truncate">{c.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="group glass-input rounded-2xl p-3 border border-white/10 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:border-emerald-400/30 focus-within:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_-8px_rgba(52,211,153,0.5)]">
        <textarea
          ref={ref}
          value={value}
          onChange={onChange}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Message Matrix Dash…  (/ for commands)"}
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
            <button
              type="button"
              onClick={() => setUseClaudeCode(!useClaudeCode)}
              className={cn(
                "hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-[10px] border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                useClaudeCode
                  ? "bg-amber-400/15 text-amber-300 border-amber-400/30 shadow-[0_0_18px_-6px_rgba(251,191,36,0.6)]"
                  : "text-text-muted border-white/5 hover:text-text-secondary"
              )}
              title="Run the chat through the OpenClaude coding-agent engine on your active Matrix model"
            >
              Claude Code
            </button>
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

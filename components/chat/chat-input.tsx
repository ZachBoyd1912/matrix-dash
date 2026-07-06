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
  const {
    listening,
    supported: micSupported,
    toggle: toggleMic,
  } = useSpeechInput((text) => setValue((v) => (v ? `${v} ${text}` : text)));

  // Slash-command menu: opens while the input is a bare "/command" (no space yet).
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashQuery =
    value.startsWith("/") && !value.includes(" ") && !value.includes("\n")
      ? value.slice(1).toLowerCase()
      : null;
  const slashMatches =
    slashQuery !== null ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery)) : [];
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
    <div className="relative mx-auto w-full max-w-3xl px-4">
      {showSlash && (
        <div className="absolute right-4 bottom-full left-4 z-50 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0f]/95 py-1 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)] backdrop-blur-md">
          {slashMatches.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => selectSlash(c.name)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors duration-150",
                i === Math.min(slashIndex, slashMatches.length - 1)
                  ? "bg-emerald-400/10"
                  : "hover:bg-white/5"
              )}
            >
              <span className="font-mono text-[12px] text-emerald-300">/{c.name}</span>
              <span className="text-text-muted truncate text-[11px]">{c.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="group glass-input rounded-2xl border border-white/10 p-3 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:border-emerald-400/30 focus-within:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_-8px_rgba(52,211,153,0.5)]">
        <textarea
          ref={ref}
          value={value}
          onChange={onChange}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Message Matrix Dash…  (/ for commands)"}
          disabled={disabled}
          rows={1}
          className="text-text-primary placeholder:text-text-muted max-h-[200px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-relaxed focus:outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            {onAttach && (
              <button
                type="button"
                onClick={onAttach}
                className="text-text-muted hover:text-text-primary grid h-7 w-7 place-items-center rounded-md transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/5 active:scale-[0.98]"
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
                  "grid h-7 w-7 place-items-center rounded-md transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                  listening
                    ? "animate-pulse bg-rose-400/10 text-rose-400"
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
                "grid h-7 w-7 place-items-center rounded-md transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                autoSpeak
                  ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
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
                "hidden h-6 items-center rounded-full border px-2.5 text-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] sm:inline-flex",
                useClaudeCode
                  ? "border-amber-400/30 bg-amber-400/15 text-amber-300 shadow-[0_0_18px_-6px_rgba(251,191,36,0.6)]"
                  : "text-text-muted hover:text-text-secondary border-white/5"
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
                  className="glass-input text-text-secondary h-7 rounded-md border border-white/5 px-2 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/10 focus:border-emerald-400/30 focus:shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)] focus:outline-none"
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
              <span className="text-text-muted text-[11px]">No provider configured</span>
            )}
            {busy ? (
              <button
                onClick={onCancel}
                className="text-text-primary grid h-8 w-8 place-items-center rounded-full border border-white/5 bg-white/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/15 active:scale-[0.98]"
                aria-label="Stop"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={disabled || !value.trim()}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                  value.trim()
                    ? "bg-emerald-400 text-black shadow-[0_0_22px_-4px_rgba(52,211,153,0.7)] hover:bg-emerald-300"
                    : "text-text-muted cursor-not-allowed border border-white/5 bg-white/10"
                )}
                aria-label="Send"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-text-muted mt-2 text-center text-[10px]">
        Matrix Dash extracts memories silently after every reply.
      </p>
    </div>
  );
}

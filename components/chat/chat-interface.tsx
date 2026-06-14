"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const uid = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? (crypto.randomUUID as () => string)()
    : Math.random().toString(36).slice(2);
import { Paperclip, X } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { LogoMark } from "@/components/layout/logo";
import { useAppStore } from "@/lib/stores/use-app-store";
import { speak } from "@/lib/hooks/use-voice";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
}

interface Props {
  sessionId?: string;
  initialMessages?: ChatMessage[];
  /** Hide the giant "Matrix Dash" hero when embedded in a session view. */
  embedded?: boolean;
  /**
   * Optional host context (e.g. the file open in the IDE). Sent as a separate
   * `systemContext` field and merged into the system prompt server-side, so it
   * never becomes a chat bubble, never enters chat history, and never reaches
   * memory extraction. Evaluated fresh at send time.
   */
  contextText?: () => string | null | undefined;
}

export function ChatInterface({ sessionId, initialMessages, embedded, contextText }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const providerId = useAppStore((s) => s.activeProviderId);
  const providers = useAppStore((s) => s.providers);
  const chatMode = useAppStore((s) => s.chatMode);
  const autoSpeak = useAppStore((s) => s.autoSpeak);
  const modelOverride = useAppStore((s) => s.modelOverride);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setAttachment({
          name: data.name,
          text: data.extractedText || `[attached ${data.kind}: ${data.name}]`,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (initialMessages) setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      setError(null);
      const composedText = attachment
        ? `${text}\n\n[Attached: ${attachment.name}]\n${attachment.text.slice(0, 12000)}`
        : text;
      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        content: composedText,
      };
      setAttachment(null);
      const assistantId = uid();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      const history = [...messages, userMessage];
      setMessages([...history, assistantPlaceholder]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const convo = history.map(({ role, content }) => ({ role, content }));
        // Host context (e.g. the IDE's open file) goes in a separate field and is
        // merged into the system prompt server-side — so the transcript stays clean,
        // it never reaches memory extraction, and the model only ever sees a single
        // leading system message (safe across every provider, incl. Gemini).
        const ctx = contextText?.();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: convo,
            providerId,
            sessionId,
            mode: chatMode,
            systemContext: ctx && ctx.trim() ? ctx : undefined,
            modelOverride: modelOverride ?? undefined,
            reasoningEffort,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({ error: "Stream failed" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let thinking = "";
        let streamError = "";
        let buffer = "";

        // Parse the NDJSON stream line-by-line: {type:"text"|"reasoning"|"error", value}.
        const handleLine = (raw: string) => {
          const trimmed = raw.trim();
          if (!trimmed) return;
          try {
            const evt = JSON.parse(trimmed) as { type?: string; value?: string };
            if (evt.type === "text") acc += evt.value ?? "";
            else if (evt.type === "reasoning") thinking += evt.value ?? "";
            else if (evt.type === "error") streamError = evt.value ?? "Stream error";
          } catch {
            // Backward-compat: a server that streams plain text → treat as reply text.
            acc += raw;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the trailing partial line
          for (const l of lines) handleLine(l);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: acc, thinking: thinking || undefined } : m
            )
          );
        }
        if (buffer) handleLine(buffer);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: acc, thinking: thinking || undefined } : m
          )
        );

        if (streamError && !acc.trim()) throw new Error(streamError);
        if (autoSpeak && acc.trim()) speak(acc);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          /* user-cancelled */
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, providerId, sessionId, chatMode, autoSpeak, attachment, contextText, modelOverride, reasoningEffort]
  );

  const empty = messages.length === 0;
  const noProvider = providers.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {empty && !embedded ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="grid place-items-center w-16 h-16 rounded-2xl glass bezel sheen transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
              <LogoMark size={40} />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">Matrix Dash</h1>
            <p className="eyebrow text-text-muted">Your AI command center</p>
          </div>
          {noProvider && (
            <div className="mb-6 glass rounded-xl px-4 py-3 text-xs text-text-secondary max-w-md text-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
              No AI provider yet. Add one in{" "}
              <Link
                href="/dashboard/settings"
                className="text-emerald-300 hover:text-emerald-200 underline decoration-emerald-400/40 underline-offset-2 transition-colors duration-200"
              >
                Settings → Add Models
              </Link>{" "}
              to start chatting.
            </div>
          )}
          <div className="w-full">
            <ChatInput onSubmit={send} onAttach={() => fileInputRef.current?.click()} busy={streaming} disabled={noProvider} />
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb:hover]:bg-white/20"
          >
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  thinking={m.thinking}
                  streaming={streaming && m.role === "assistant" && m.id === messages[messages.length - 1].id}
                />
              ))}
              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs px-4 py-3 shadow-[0_0_18px_-8px_rgba(244,63,94,0.6)]">
                  {error}
                </div>
              )}
            </div>
          </div>
          <div className="py-4 bg-gradient-to-t from-bg-base via-bg-base/80 to-transparent">
            {attachment && (
              <div className="max-w-3xl mx-auto px-4 mb-2">
                <div className="inline-flex items-center gap-2 glass-input rounded-full px-3 py-1 text-xs text-text-secondary border border-emerald-400/20 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Paperclip size={11} className="text-emerald-300" />
                  <span className="max-w-[200px] truncate">{attachment.name}</span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="text-text-muted hover:text-rose-400 transition-colors duration-200 active:scale-[0.98]"
                    aria-label="Remove attachment"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}
            <ChatInput
              onSubmit={send}
              onCancel={cancel}
              onAttach={() => fileInputRef.current?.click()}
              busy={streaming}
              disabled={noProvider}
            />
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,text/*,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

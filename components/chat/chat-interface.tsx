"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
}

interface Props {
  sessionId?: string;
  initialMessages?: ChatMessage[];
  /** Hide the giant "Matrix Dash" hero when embedded in a session view. */
  embedded?: boolean;
}

export function ChatInterface({ sessionId, initialMessages, embedded }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const providerId = useAppStore((s) => s.activeProviderId);
  const providers = useAppStore((s) => s.providers);
  const chatMode = useAppStore((s) => s.chatMode);
  const autoSpeak = useAppStore((s) => s.autoSpeak);
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
        id: crypto.randomUUID(),
        role: "user",
        content: composedText,
      };
      setAttachment(null);
      const assistantId = crypto.randomUUID();
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
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
            providerId,
            sessionId,
            mode: chatMode,
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
        }
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
    [messages, providerId, sessionId, chatMode, autoSpeak, attachment]
  );

  const empty = messages.length === 0;
  const noProvider = providers.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {empty && !embedded ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center gap-2 mb-8">
            <LogoMark size={48} />
            <h1 className="text-3xl font-extrabold tracking-tight">Matrix Dash</h1>
            <p className="text-text-secondary text-sm">Your AI command center.</p>
          </div>
          {noProvider && (
            <div className="mb-6 glass rounded-xl px-4 py-3 text-xs text-text-secondary max-w-md text-center">
              No AI provider yet. Add one in{" "}
              <Link href="/dashboard/settings" className="text-emerald-400 hover:underline">
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
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  streaming={streaming && m.role === "assistant" && m.id === messages[messages.length - 1].id}
                />
              ))}
              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs px-4 py-3">
                  {error}
                </div>
              )}
            </div>
          </div>
          <div className="py-4 bg-gradient-to-t from-bg-base via-bg-base/80 to-transparent">
            {attachment && (
              <div className="max-w-3xl mx-auto px-4 mb-2">
                <div className="inline-flex items-center gap-2 glass-input rounded-full px-3 py-1 text-xs text-text-secondary">
                  <Paperclip size={11} />
                  <span className="max-w-[200px] truncate">{attachment.name}</span>
                  <button onClick={() => setAttachment(null)} className="text-text-muted hover:text-rose-400" aria-label="Remove attachment">
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

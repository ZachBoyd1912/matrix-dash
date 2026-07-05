"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const uid = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? (crypto.randomUUID as () => string)()
    : Math.random().toString(36).slice(2);
import { Paperclip, X } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ClaudeCodeEmpty } from "./claude-code-hero";
import { LogoMark } from "@/components/layout/logo";
import { useAppStore } from "@/lib/stores/use-app-store";
import { speak } from "@/lib/hooks/use-voice";
import { SLASH_COMMANDS } from "@/lib/chat/slash-commands";
import { useRouter } from "next/navigation";
import {
  appendEvent,
  blocksToText,
  parseBlocksJson,
  textToBlocks,
  type ApprovalDecision,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  blocks: Block[];
}

/** Shape persisted sessions pass in — converted to blocks on load. */
interface InitialMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** JSON-encoded Block[] from session_messages.blocks (assistant turns). */
  blocks?: string | null;
}

const toChatMessage = (m: InitialMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  // Prefer the structured transcript; fall back to the legacy content string.
  blocks: parseBlocksJson(m.blocks) ?? textToBlocks(m.content),
});

interface Props {
  sessionId?: string;
  initialMessages?: InitialMessage[];
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => (initialMessages ?? []).map(toChatMessage));
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const providerId = useAppStore((s) => s.activeProviderId);
  const providers = useAppStore((s) => s.providers);
  const chatMode = useAppStore((s) => s.chatMode);
  const useClaudeCode = useAppStore((s) => s.useClaudeCode);
  const setModelSelectorOpen = useAppStore((s) => s.setModelSelectorOpen);
  const autoSpeak = useAppStore((s) => s.autoSpeak);
  const router = useRouter();
  const modelOverride = useAppStore((s) => s.modelOverride);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [ccInstalled, setCcInstalled] = useState<boolean | null>(null);

  // When the Claude Code engine is toggled on, check whether the CLI is present.
  useEffect(() => {
    if (!useClaudeCode) {
      setCcInstalled(null);
      return;
    }
    fetch("/api/ai/openclaude")
      .then((r) => r.json())
      .then((s) => setCcInstalled(!!s.installed))
      .catch(() => setCcInstalled(false));
  }, [useClaudeCode]);

  const ccBanner =
    useClaudeCode && ccInstalled === false ? (
      <div className="max-w-3xl mx-auto px-4 mb-2">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs px-4 py-3 leading-relaxed">
          OpenClaude isn&apos;t installed yet. Run{" "}
          <code className="font-mono bg-black/30 px-1 rounded">npm install -g @gitlawb/openclaude@latest</code> in a
          terminal, then reload — it runs on your active Matrix model automatically.
        </div>
      </div>
    ) : null;

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
    if (initialMessages) setMessages(initialMessages.map(toChatMessage));
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

  // Settle an interactive tool approval — resumes the paused tool in the open
  // stream. The approval block flips to its resolved state when the server's
  // `approval_resolved` event arrives.
  const approve = useCallback((approvalId: string, decision: ApprovalDecision) => {
    void fetch("/api/ai/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalId, decision }),
    }).catch(() => {});
  }, []);

  const send = useCallback(
    async (text: string) => {
      setError(null);
      // Slash commands → Matrix UI actions. compact/init/review fall through to the engine.
      const t = text.trim();
      if (t.startsWith("/")) {
        const cmd = t.slice(1).split(/\s+/)[0].toLowerCase();
        const inject = (msg: string) =>
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant" as const, blocks: [{ kind: "text" as const, text: msg }] },
          ]);
        let handled = true;
        switch (cmd) {
          case "clear":
            setMessages([]);
            break;
          case "model":
            setModelSelectorOpen(true);
            break;
          case "agents":
          case "permissions":
            router.push("/dashboard/settings/agent-tools");
            break;
          case "mcp":
            router.push("/dashboard/settings/integrations");
            break;
          case "memory":
            router.push("/dashboard/memory-bank");
            break;
          case "usage":
            router.push("/dashboard/settings/diagnostics");
            break;
          case "context": {
            const active = providers.find((p) => p.id === providerId);
            inject(
              `Context — ${messages.length} message(s) · provider: ${active?.name ?? "none"} · model: ${
                modelOverride ?? active?.defaultModel ?? "default"
              }.`
            );
            break;
          }
          case "help":
            inject("Slash commands:\n" + SLASH_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n"));
            break;
          default:
            handled = false; // compact / init / review → send to the engine
        }
        if (handled) return;
      }
      const composedText = attachment
        ? `${text}\n\n[Attached: ${attachment.name}]\n${attachment.text.slice(0, 12000)}`
        : text;
      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        blocks: textToBlocks(composedText),
      };
      setAttachment(null);
      const assistantId = uid();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: "assistant",
        blocks: [],
      };
      const history = [...messages, userMessage];
      setMessages([...history, assistantPlaceholder]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const convo = history.map((m) => ({ role: m.role, content: blocksToText(m.blocks) }));
        // Host context (e.g. the IDE's open file) goes in a separate field and is
        // merged into the system prompt server-side — so the transcript stays clean,
        // it never reaches memory extraction, and the model only ever sees a single
        // leading system message (safe across every provider, incl. Gemini).
        const ctx = contextText?.();
        // Route to the OpenClaude engine when enabled (runs the active Matrix
        // provider natively), else Matrix's native agent.
        const endpoint = useClaudeCode ? "/api/ai/openclaude" : "/api/ai/chat";
        const res = await fetch(endpoint, {
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
        // Accumulate the assistant turn as an ordered list of typed blocks. `idMap`
        // matches each tool_result back to its tool_call by id.
        const blocks: Block[] = [];
        const idMap = new Map<string, number>();
        let streamError = "";
        let buffer = "";

        // Parse the NDJSON stream line-by-line into stream events, folding each into
        // the block list. Top-level stream errors stay a banner (not a block).
        const handleLine = (raw: string) => {
          const trimmed = raw.trim();
          if (!trimmed) return;
          try {
            const evt = JSON.parse(trimmed) as StreamEvent;
            if (evt.type === "error") {
              streamError = evt.value || "Stream error";
              return;
            }
            appendEvent(blocks, idMap, evt);
          } catch {
            // Backward-compat: a server that streams plain text → treat as reply text.
            appendEvent(blocks, idMap, { type: "text", value: raw });
          }
        };

        // A fresh array reference each tick so React re-renders the streamed blocks.
        const flush = () =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, blocks: [...blocks] } : m))
          );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the trailing partial line
          for (const l of lines) handleLine(l);
          flush();
        }
        if (buffer) handleLine(buffer);
        flush();

        const replyText = blocksToText(blocks);
        if (streamError && !replyText.trim()) throw new Error(streamError);
        if (autoSpeak && replyText.trim()) speak(replyText);
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
    [messages, providers, providerId, sessionId, chatMode, useClaudeCode, autoSpeak, attachment, contextText, modelOverride, reasoningEffort, router, setModelSelectorOpen]
  );

  const empty = messages.length === 0;
  const noProvider = providers.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {empty && !embedded ? (
        useClaudeCode ? (
          <ClaudeCodeEmpty>
            {ccBanner}
            <ChatInput onSubmit={send} onAttach={() => fileInputRef.current?.click()} busy={streaming} disabled={noProvider} />
          </ClaudeCodeEmpty>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="grid place-items-center w-16 h-16 rounded-2xl glass bezel sheen transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <LogoMark size={40} />
              </div>
              <h1 className="font-display italic text-3xl text-text-primary">Matrix Dash</h1>
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
        )
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
                  blocks={m.blocks}
                  streaming={streaming && m.role === "assistant" && m.id === messages[messages.length - 1].id}
                  onApprove={approve}
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { toast } from "@/lib/stores/use-feedback";
import { speak } from "@/lib/hooks/use-voice";
import { SLASH_COMMANDS } from "@/lib/chat/slash-commands";
import {
  estimateMessagesTokens,
  getModelContextLimit,
  getContextUsagePercent,
} from "@/lib/ai/tokens";
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
  /** Set once the fallback cascade reports this turn was served by a non-primary provider. */
  fallbackNotice?: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    (initialMessages ?? []).map(toChatMessage)
  );
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
      <div className="mx-auto mb-2 max-w-3xl px-4">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          OpenClaude isn&apos;t installed yet. Run{" "}
          <code className="rounded bg-black/30 px-1 font-mono">
            npm install -g @gitlawb/openclaude@latest
          </code>{" "}
          in a terminal, then reload — it runs on your active Matrix model automatically.
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

  // Shared by both compaction paths: the automatic one (server folds older
  // turns mid-stream and reports back via a `context_compacted` event) and the
  // manual `/compact` command. Both identify "how many of the oldest messages
  // this summary replaces" as a plain prefix count, so replacing that prefix in
  // whatever the current state is works for either caller.
  const applyCompaction = useCallback((summarizedCount: number, summary: string) => {
    setMessages((prev) => {
      const kept = prev.slice(summarizedCount);
      const summaryMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        blocks: [
          { kind: "text", text: `📎 Compacted ${summarizedCount} earlier message(s): ${summary}` },
        ],
      };
      return [summaryMsg, ...kept];
    });
  }, []);

  // Live, client-side estimate of the current conversation's context usage —
  // same char/4 heuristic the server uses to decide when to compact, so the bar
  // and the server's actual behavior stay in agreement.
  const contextInfo = useMemo(() => {
    const active = providers.find((p) => p.id === providerId);
    const modelId = modelOverride ?? active?.defaultModel ?? "";
    const estimated = estimateMessagesTokens(
      messages.map((m) => ({ content: blocksToText(m.blocks) }))
    );
    const limit = getModelContextLimit(active?.provider ?? null, modelId || null);
    return { estimated, limit, percent: getContextUsagePercent(estimated, limit) };
  }, [messages, providers, providerId, modelOverride]);

  const contextWarnedRef = useRef(false);
  useEffect(() => {
    if (contextInfo.percent >= 90 && !contextWarnedRef.current) {
      contextWarnedRef.current = true;
      toast.info(
        "Context window filling up",
        `~${contextInfo.percent}% used — try /compact to free some up.`
      );
    } else if (contextInfo.percent < 90) {
      contextWarnedRef.current = false;
    }
  }, [contextInfo.percent]);

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
            {
              id: uid(),
              role: "assistant" as const,
              blocks: [{ kind: "text" as const, text: msg }],
            },
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
              `Context — ${messages.length} message(s), ~${contextInfo.estimated.toLocaleString()} tokens ` +
                `(${contextInfo.percent}% of ~${contextInfo.limit.toLocaleString()}) · provider: ${active?.name ?? "none"} · model: ${
                  modelOverride ?? active?.defaultModel ?? "default"
                }.`
            );
            break;
          }
          case "compact": {
            if (messages.length < 2) {
              inject("Nothing to compact yet.");
              break;
            }
            const convo = messages.map((m) => ({ role: m.role, content: blocksToText(m.blocks) }));
            try {
              const res = await fetch("/api/ai/compact", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  messages: convo,
                  providerId,
                  modelOverride: modelOverride ?? undefined,
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                inject(data.error || "Could not compact the conversation.");
                break;
              }
              applyCompaction(data.summarizedCount, data.summary);
            } catch {
              inject("Could not reach the compaction endpoint.");
            }
            break;
          }
          case "help":
            inject(
              "Slash commands:\n" +
                SLASH_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n")
            );
            break;
          default:
            handled = false; // init / review → send to the engine
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
        let fallbackNotice: string | undefined;
        // A ref-like holder (not a bare `let`) so reading it after the loop isn't
        // subject to TS narrowing a closure-mutated let back to `null`.
        const compaction: { current: { summarizedCount: number; summary: string } | null } = {
          current: null,
        };
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
            if (evt.type === "provider_used") {
              if (evt.fellBack) {
                fallbackNotice = `Replied via ${evt.name} after the primary provider failed.`;
                toast.info("Switched provider", fallbackNotice);
              }
              return;
            }
            if (evt.type === "context_compacted") {
              // Applied after the stream finishes (below), once the assistant's
              // reply has landed in state — applyCompaction slices from whatever
              // the current state is, which by then includes this turn's reply.
              compaction.current = { summarizedCount: evt.summarizedCount, summary: evt.summary };
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
            prev.map((m) =>
              m.id === assistantId ? { ...m, blocks: [...blocks], fallbackNotice } : m
            )
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

        // `history` (captured above) is a prefix of the post-flush state — this
        // turn's assistant reply is now in state too, so applying the swap here
        // (rather than inside handleLine, before the reply exists) is what makes
        // the *next* request small: it re-sends from this trimmed state, not the
        // full pre-compaction history.
        if (compaction.current) {
          applyCompaction(compaction.current.summarizedCount, compaction.current.summary);
        }

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
    [
      messages,
      providers,
      providerId,
      sessionId,
      chatMode,
      useClaudeCode,
      autoSpeak,
      attachment,
      contextText,
      modelOverride,
      reasoningEffort,
      router,
      setModelSelectorOpen,
    ]
  );

  const empty = messages.length === 0;
  const noProvider = providers.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {empty && !embedded ? (
        useClaudeCode ? (
          <ClaudeCodeEmpty>
            {ccBanner}
            <ChatInput
              onSubmit={send}
              onAttach={() => fileInputRef.current?.click()}
              busy={streaming}
              disabled={noProvider}
            />
          </ClaudeCodeEmpty>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="mb-8 flex flex-col items-center gap-3">
              <div className="glass bezel sheen grid h-16 w-16 place-items-center rounded-2xl transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <LogoMark size={40} />
              </div>
              <h1 className="font-display text-text-primary text-3xl italic">Matrix Dash</h1>
              <p className="eyebrow text-text-muted">Your AI command center</p>
            </div>
            {noProvider && (
              <div className="glass text-text-secondary mb-6 max-w-md rounded-xl px-4 py-3 text-center text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                No AI provider yet. Add one in{" "}
                <Link
                  href="/dashboard/settings"
                  className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-2 transition-colors duration-200 hover:text-emerald-200"
                >
                  Settings → Add Models
                </Link>{" "}
                to start chatting.
              </div>
            )}
            <div className="w-full">
              <ChatInput
                onSubmit={send}
                onAttach={() => fileInputRef.current?.click()}
                busy={streaming}
                disabled={noProvider}
              />
            </div>
          </div>
        )
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb:hover]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  blocks={m.blocks}
                  streaming={
                    streaming && m.role === "assistant" && m.id === messages[messages.length - 1].id
                  }
                  onApprove={approve}
                  fallbackNotice={m.fallbackNotice}
                />
              ))}
              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 shadow-[0_0_18px_-8px_rgba(244,63,94,0.6)]">
                  {error}
                </div>
              )}
            </div>
          </div>
          <div className="from-bg-base via-bg-base/80 bg-gradient-to-t to-transparent py-4">
            {contextInfo.percent >= 50 && (
              <div className="mx-auto mb-2 max-w-3xl px-4">
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-white/8"
                  title={`~${contextInfo.estimated.toLocaleString()} / ~${contextInfo.limit.toLocaleString()} tokens (${contextInfo.percent}%, estimated)`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      contextInfo.percent >= 90
                        ? "bg-rose-400"
                        : contextInfo.percent >= 70
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                    }`}
                    style={{ width: `${contextInfo.percent}%` }}
                  />
                </div>
              </div>
            )}
            {attachment && (
              <div className="mx-auto mb-2 max-w-3xl px-4">
                <div className="glass-input text-text-secondary inline-flex items-center gap-2 rounded-full border border-emerald-400/20 px-3 py-1 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Paperclip size={11} className="text-emerald-300" />
                  <span className="max-w-[200px] truncate">{attachment.name}</span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="text-text-muted transition-colors duration-200 hover:text-rose-400 active:scale-[0.98]"
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

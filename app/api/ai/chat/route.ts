import { streamText, stepCountIs, type ModelMessage } from "ai";
import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { searchSkillsFts } from "@/lib/db/fts";
import { sessionMessages, skills, presets } from "@/lib/db/schema";
import {
  getProvider,
  getActiveProvider,
  resolveModel,
  type ProviderRecord,
} from "@/lib/ai/registry";
import { buildMemoryContext } from "@/lib/ai/injection";
import { extractMemories } from "@/lib/ai/extraction";
import { getAppSettings } from "@/lib/db/settings";
import { buildAgentTools } from "@/lib/ai/tools";
import { buildProviderOptions, type ReasoningEffort } from "@/lib/ai/models";
import { providerSpec } from "@/types/ai-provider";
import {
  appendEvent,
  blocksToText,
  serializeBlocksForStorage,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";

export const dynamic = "force-dynamic";

interface ChatPayload {
  messages: ModelMessage[];
  providerId?: string;
  modelOverride?: string;
  sessionId?: string;
  mode?: "chat" | "agent";
  presetId?: string;
  /** Ephemeral host context (e.g. the IDE's open file). Merged into the system prompt, never stored. */
  systemContext?: string;
  /** Per-request reasoning/thinking level; falls back to the global setting when omitted. */
  reasoningEffort?: ReasoningEffort;
}

// Rather than concatenate every enabled skill into the prompt (a user can have
// hundreds enabled from an imported catalog), retrieve only the skills relevant
// to the current turn via FTS — this is the retrieval half of skill RAG. A
// character budget still caps the injected text as a final safety net.
const SKILLS_PROMPT_BUDGET = 60_000;
const SKILLS_TOP_K = 8;

function buildSkillsPrompt(userText: string): string {
  // Top-K skills matching this turn. When there's no query signal (e.g. an
  // empty/non-text opener), fall back to the most recently enabled skills.
  let selected: { name: string; instructions: string }[] = userText
    ? searchSkillsFts(userText, SKILLS_TOP_K)
    : [];
  if (selected.length === 0) {
    selected = getDb()
      .select({ name: skills.name, instructions: skills.instructions })
      .from(skills)
      .where(eq(skills.isEnabled, true))
      .orderBy(desc(skills.updatedAt))
      .limit(SKILLS_TOP_K)
      .all();
  }
  if (selected.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const s of selected) {
    const block = `### ${s.name}\n${s.instructions}`;
    if (used + block.length > SKILLS_PROMPT_BUDGET && lines.length > 0) {
      omitted++;
      continue;
    }
    lines.push(block);
    used += block.length;
  }
  const note =
    omitted > 0
      ? `\n\n(${omitted} more relevant skill${omitted === 1 ? "" : "s"} omitted to fit the context budget.)`
      : "";
  return `These skills are relevant to the current request — apply them when useful. Call findSkills/loadSkill to pull in others if the task needs them.\n\n${lines.join("\n\n")}${note}`;
}

export async function POST(req: Request) {
  let body: ChatPayload;
  try {
    body = (await req.json()) as ChatPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, providerId, modelOverride, sessionId, mode, presetId, systemContext, reasoningEffort } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }
  const isAgent = mode === "agent";

  let provider: ProviderRecord | undefined;
  if (providerId) {
    provider = getProvider(providerId);
  } else {
    provider = getActiveProvider();
  }
  if (!provider) {
    return Response.json(
      { error: "No AI provider configured. Add one in Settings → Add Models." },
      { status: 404 }
    );
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText =
    lastUser && typeof lastUser.content === "string" ? lastUser.content : "";

  const memoryContext = userText ? buildMemoryContext(userText) : "";
  const appSettings = getAppSettings();

  let presetPrompt = "";
  if (presetId) {
    const preset = getDb().select().from(presets).where(eq(presets.id, presetId)).get();
    if (preset) presetPrompt = preset.systemPrompt;
  }

  const agentPreamble = isAgent
    ? "You are Jarvis, an autonomous personal assistant. You can use tools to search memory, notes, the web, manage tasks and calendar, and draft email. Take initiative: call tools to gather what you need, then act. Be concise."
    : "";
  const skillsPrompt = isAgent ? buildSkillsPrompt(userText) : "";

  // Host-supplied ephemeral context (e.g. the IDE's open file). Bounded server-side
  // and folded into the single leading system message rather than sent as its own
  // message — so it can't pollute the transcript, session history, or extraction,
  // and no provider adapter has to cope with two consecutive system messages.
  const hostContext =
    typeof systemContext === "string" ? systemContext.slice(0, 20000) : "";

  const systemBits = [presetPrompt || appSettings.systemPrompt, agentPreamble, skillsPrompt, memoryContext, hostContext]
    .map((b) => b?.trim())
    .filter((b): b is string => !!b);

  // @ai-sdk/openai sends the system message as role "developer" for any model id
  // that isn't gpt-3 / gpt-4 / chatgpt-4o / gpt-5-chat. First-party OpenAI accepts
  // that, but third-party openai-compat endpoints (deepseek, opencode, openrouter…)
  // reject the "developer" role. For those, fold the system text into the first
  // user turn so no "system"/"developer" message is ever sent.
  const spec = providerSpec(provider.provider);
  const foldSystem =
    (spec?.sdk ?? "openai-compat") === "openai-compat" && provider.provider !== "openai";

  const systemContent = systemBits.join("\n\n");
  let finalMessages: ModelMessage[];
  if (!systemContent) {
    finalMessages = messages;
  } else if (!foldSystem) {
    finalMessages = [{ role: "system", content: systemContent }, ...messages];
  } else {
    const i = messages.findIndex((m) => m.role === "user" && typeof m.content === "string");
    finalMessages =
      i === -1
        ? [{ role: "user", content: systemContent } as ModelMessage, ...messages]
        : messages.map((m, idx) =>
            idx === i
              ? ({ ...m, content: `${systemContent}\n\n———\n\n${m.content as string}` } as ModelMessage)
              : m
          );
  }

  // Persist the user message immediately if we have a session.
  if (sessionId && lastUser && typeof lastUser.content === "string") {
    try {
      getDb()
        .insert(sessionMessages)
        .values({
          id: randomUUID(),
          sessionId,
          role: "user",
          content: lastUser.content,
          providerId: provider.id,
          modelName: modelOverride || provider.defaultModel || null,
          createdAt: new Date().toISOString(),
        })
        .run();
    } catch (err) {
      console.error("[chat] failed to persist user message:", err);
    }
  }

  let model;
  try {
    model = resolveModel(provider, modelOverride);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Provider error: ${message}` }, { status: 500 });
  }

  const capturedProvider = provider;
  const tools = isAgent ? buildAgentTools() : undefined;

  // Reasoning/thinking: scoped to the provider's SDK + the model's capability.
  // An explicit per-request effort wins; otherwise the global enableThinking
  // setting decides (preserving prior Anthropic-only behavior).
  const modelId = modelOverride || provider.defaultModel || "";
  const providerOptions = buildProviderOptions(
    provider.provider,
    modelId,
    reasoningEffort,
    appSettings.enableThinking
  );

  const result = streamText({
    model,
    messages: finalMessages,
    tools,
    stopWhen: isAgent ? stepCountIs(8) : undefined,
    providerOptions,
    onFinish: async ({ text }) => {
      // Memory extraction runs in the background. Assistant-row persistence happens
      // in the stream's `finally` below, where the full block transcript is assembled.
      const fullMessages: ModelMessage[] = [
        // Only real user/assistant turns feed extraction — never system messages
        // (host context, presets, memory blocks), which would otherwise get mined
        // and persisted as bogus "memories".
        ...messages.filter((m) => m.role !== "system"),
        { role: "assistant", content: text },
      ];
      void extractMemories(fullMessages).catch((err) =>
        console.error("[chat] extraction failed:", err)
      );
    },
  });

  // NDJSON stream: one JSON object per line. Each event is also folded into a
  // server-side block array (via the same reducer the client uses) so the
  // structured transcript can be persisted for replay on reload.
  const encoder = new TextEncoder();
  const line = (obj: object) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const serverBlocks: Block[] = [];
      const idMap = new Map<string, number>();
      // Emit one event to the client AND fold it into the persisted transcript.
      const emit = (ev: StreamEvent) => {
        appendEvent(serverBlocks, idMap, ev);
        controller.enqueue(line(ev));
      };
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            emit({ type: "text", value: part.text });
          } else if (part.type === "reasoning-delta") {
            emit({ type: "reasoning", value: part.text });
          } else if (part.type === "tool-call") {
            // Surface each agent tool invocation so the client can render it as a
            // Claude-Code-style tool card (matched to its result by toolCallId).
            emit({ type: "tool_call", id: part.toolCallId, name: part.toolName, args: part.input });
          } else if (part.type === "tool-result") {
            emit({ type: "tool_result", id: part.toolCallId, name: part.toolName, result: part.output });
          } else if (part.type === "tool-error") {
            const msg = part.error instanceof Error ? part.error.message : String(part.error);
            emit({ type: "tool_result", id: part.toolCallId, name: part.toolName, error: msg });
          } else if (part.type === "error") {
            const msg = part.error instanceof Error ? part.error.message : String(part.error);
            emit({ type: "error", value: msg });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: "error", value: msg });
      } finally {
        // Persist the assistant turn with its structured block transcript. `content`
        // stays the concatenated text so extraction/search/export keep working.
        if (sessionId && serverBlocks.length) {
          try {
            getDb()
              .insert(sessionMessages)
              .values({
                id: randomUUID(),
                sessionId,
                role: "assistant",
                content: blocksToText(serverBlocks),
                blocks: serializeBlocksForStorage(serverBlocks),
                providerId: capturedProvider.id,
                modelName: modelOverride || capturedProvider.defaultModel || null,
                createdAt: new Date().toISOString(),
              })
              .run();
          } catch (err) {
            console.error("[chat] failed to persist assistant message:", err);
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-provider-id": provider.id,
    },
  });
}

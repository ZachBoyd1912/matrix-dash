import { stepCountIs, type ModelMessage, type TextStreamPart } from "ai";
import { randomUUID } from "crypto";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { searchSkillsFts } from "@/lib/db/fts";
import { sessionMessages, skills, presets } from "@/lib/db/schema";
import {
  getProvider,
  getActiveProvider,
  resolveModel,
  getFallbackChain,
  type ProviderRecord,
  type FallbackCandidate,
} from "@/lib/ai/registry";
import { streamWithFallback } from "@/lib/ai/fallback";
import { buildMemoryContext } from "@/lib/ai/injection";
import { extractMemories } from "@/lib/ai/extraction";
import { getAppSettings } from "@/lib/db/settings";
import {
  estimateTokens,
  estimateMessagesTokens,
  getModelContextLimit,
  getContextUsagePercent,
} from "@/lib/ai/tokens";
import { summarizeOlderMessages } from "@/lib/ai/summarizer";
import { buildAgentTools } from "@/lib/ai/tools";
import { buildProviderOptions, type ReasoningEffort } from "@/lib/ai/models";
import { shouldFoldSystemPrompt } from "@/types/ai-provider";
import {
  appendEvent,
  blocksToText,
  serializeBlocksForStorage,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";
import { getPowerLevel } from "@/lib/ai/power";
import type { AgentRequestContext } from "@/lib/ai/approvals";
import type { GenerationParams } from "@/types/settings";

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
  /** Sampling overrides for this request — merged over the preset's own, if any. */
  generationParams?: GenerationParams;
}

// Bounds are defensive (this is client-controlled input reaching a paid API
// call), not because the UI can produce out-of-range values — the sliders
// already clamp to these ranges. Invalid input is dropped, not 400'd: a bad
// param shouldn't break the chat, it should just fall back to provider defaults.
const generationParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  stopSequences: z.array(z.string().max(200)).max(10).optional(),
});

function parseGenerationParams(value: unknown): GenerationParams {
  const parsed = generationParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
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

  const {
    messages,
    providerId,
    modelOverride,
    sessionId,
    mode,
    presetId,
    systemContext,
    reasoningEffort,
    generationParams: requestGenerationParams,
  } = body;
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
  const userText = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";

  const memoryContext = userText ? buildMemoryContext(userText) : "";
  const appSettings = getAppSettings();

  let presetPrompt = "";
  let presetGenerationParams: GenerationParams = {};
  if (presetId) {
    const preset = getDb().select().from(presets).where(eq(presets.id, presetId)).get();
    if (preset) {
      presetPrompt = preset.systemPrompt;
      if (preset.generationParams) {
        try {
          presetGenerationParams = parseGenerationParams(JSON.parse(preset.generationParams));
        } catch {
          /* malformed stored JSON — ignore, fall back to no overrides */
        }
      }
    }
  }
  // Request-level params (the chat composer's Advanced panel, live for just this
  // turn) win over whatever the chosen persona/preset stored as its defaults.
  const generationParams: GenerationParams = {
    ...presetGenerationParams,
    ...parseGenerationParams(requestGenerationParams),
  };
  const agentPreamble = isAgent
    ? "You are Jarvis, an autonomous personal assistant. You can use tools to search memory, notes, the web, manage tasks and calendar, and draft email. Take initiative: call tools to gather what you need, then act. Be concise."
    : "";
  const skillsPrompt = isAgent ? buildSkillsPrompt(userText) : "";

  // Host-supplied ephemeral context (e.g. the IDE's open file). Bounded server-side
  // and folded into the single leading system message rather than sent as its own
  // message — so it can't pollute the transcript, session history, or extraction,
  // and no provider adapter has to cope with two consecutive system messages.
  const hostContext = typeof systemContext === "string" ? systemContext.slice(0, 20000) : "";

  const systemBits = [
    presetPrompt || appSettings.systemPrompt,
    agentPreamble,
    skillsPrompt,
    memoryContext,
    hostContext,
  ]
    .map((b) => b?.trim())
    .filter((b): b is string => !!b);

  const systemContent = systemBits.join("\n\n");

  // Context management: estimated against the primary/requested provider, not
  // each fallback candidate — a smaller fallback window just errors normally
  // (an acceptable, non-regressing edge case, not a special-cased path). 70%
  // (not the more common 80%) is deliberately conservative: the char/4 estimate
  // below is approximate, so leaving headroom before the soft trigger matters
  // more than matching a round number.
  const CONTEXT_SOFT_TRIGGER_PERCENT = 70;
  const CONTEXT_HARD_CEILING_PERCENT = 95;
  const CONTEXT_TRUNCATE_TARGET_PERCENT = 85;

  const contextLimit = getModelContextLimit(
    provider.provider,
    modelOverride || provider.defaultModel
  );
  let workingMessages: ModelMessage[] = messages;
  let contextCompacted: { summarizedCount: number; summary: string } | null = null;

  // Includes systemContent's own size (presets/memory/agent-preamble/host-context) —
  // live-testing this against Plan 8's real reported inputTokens turned up a case
  // where the raw-messages-only estimate was ~24 tokens against a real 651, almost
  // entirely the system prompt this omitted. Still an approximation (provider
  // request overhead, tool schemas in agent mode, etc. aren't counted either), but
  // this closes the single largest gap found.
  const estimatedContextTokens = () =>
    estimateMessagesTokens(workingMessages) + estimateTokens(systemContent);

  if (
    getContextUsagePercent(estimatedContextTokens(), contextLimit) >= CONTEXT_SOFT_TRIGGER_PERCENT
  ) {
    // Best-effort quality improvement over truncation — makes its own provider
    // call, which can fail. Truncation below is the actual guarantee and runs
    // independently of whether this succeeds.
    const summarized = await summarizeOlderMessages(workingMessages, provider, modelOverride);
    if (summarized) {
      const keptTail = workingMessages.slice(summarized.summarizedCount);
      // "user" role, not "system" — this gets sent as-is by every fallback
      // candidate finalMessagesFor() might pick, and several openai-compat
      // providers (deepseek, opencode, openrouter…) reject a "system" message
      // outright (the same constraint shouldFoldSystemPrompt exists for). A
      // plainly-labeled user turn is universally accepted.
      workingMessages = [
        {
          role: "user",
          content: `[Earlier conversation summary — background context, not something I just said]: ${summarized.summary}`,
        },
        ...keptTail,
      ];
      contextCompacted = {
        summarizedCount: summarized.summarizedCount,
        summary: summarized.summary,
      };
    }
  }

  if (
    getContextUsagePercent(estimatedContextTokens(), contextLimit) > CONTEXT_HARD_CEILING_PERCENT
  ) {
    // Drop the oldest messages (never the synthetic summary, if one was just
    // added) until back under the target — regardless of whether summarization
    // ran above; the estimate is approximate and the summarizer can fail.
    while (
      workingMessages.length > 1 &&
      getContextUsagePercent(estimatedContextTokens(), contextLimit) >
        CONTEXT_TRUNCATE_TARGET_PERCENT
    ) {
      const dropIndex = contextCompacted ? 1 : 0;
      if (dropIndex >= workingMessages.length) break;
      workingMessages.splice(dropIndex, 1);
    }
  }

  // Fold-vs-prepend depends on which provider's *kind* is actually serving the
  // request (see shouldFoldSystemPrompt), so it's computed per fallback
  // candidate rather than once for the originally requested provider — a
  // fallback provider can need different message shaping than the primary one.
  function finalMessagesFor(providerKind: string): ModelMessage[] {
    if (!systemContent) return workingMessages;
    if (!shouldFoldSystemPrompt(providerKind)) {
      return [{ role: "system", content: systemContent }, ...workingMessages];
    }

    const i = workingMessages.findIndex((m) => m.role === "user" && typeof m.content === "string");
    return i === -1
      ? [{ role: "user", content: systemContent } as ModelMessage, ...workingMessages]
      : workingMessages.map((m, idx) =>
          idx === i
            ? ({
                ...m,
                content: `${systemContent}\n\n———\n\n${m.content as string}`,
              } as ModelMessage)
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

  // Ranked candidates for this turn: the requested/active provider first, then
  // the user's configured fallback order (Settings → AI Providers). Building the
  // model + calling streamText() per candidate happens lazily inside the stream
  // below — a candidate only "wins" once its first real stream part arrives, since
  // content may already be flowing to the client by the time a later part errors.
  const chain = getFallbackChain(provider, modelOverride);
  const tools = isAgent ? buildAgentTools() : undefined;

  // Per-request context for tools: lets a tool's execute() emit an interactive
  // approval request into the live response stream and block until the user decides.
  // `emit` is bound to the real stream controller below (tools only run while we
  // consume fullStream, by which point it's wired).
  const reqCtx: AgentRequestContext = {
    emit: () => {},
    signal: req.signal,
    sessionId: sessionId ?? null,
    powerLevel: getPowerLevel(),
  };

  // Builds this candidate's streamText() options — called once per cascade
  // attempt, since the model/providerOptions differ per provider. Reasoning/
  // thinking is scoped to the provider's SDK + the model's capability; an
  // explicit per-request effort wins, otherwise the global enableThinking
  // setting decides (preserving prior Anthropic-only behavior).
  const buildStreamOptions = (candidate: FallbackCandidate) => {
    const modelId = candidate.modelOverride || candidate.provider.defaultModel || "";
    return {
      model: resolveModel(candidate.provider, candidate.modelOverride),
      messages: finalMessagesFor(candidate.provider.provider),
      tools,
      stopWhen: isAgent ? stepCountIs(8) : undefined,
      providerOptions: buildProviderOptions(
        candidate.provider.provider,
        modelId,
        reasoningEffort,
        appSettings.enableThinking
      ),
      // Sampling overrides (temperature, topP, maxOutputTokens, etc.) — field
      // names already match streamText()'s own CallSettings, so no translation
      // needed. Same for every candidate: these are a user/preset choice, not
      // something that varies by which provider ends up serving the request.
      ...generationParams,
      abortSignal: req.signal,
      experimental_context: reqCtx,
      // The fallback cascade's own retry (lib/ai/retry.ts) owns the backoff
      // schedule — leaving the SDK's default maxRetries: 2 on top would silently
      // compound into up to 3x the delay per cascade attempt.
      maxRetries: 0,
      onError: ({ error }: { error: unknown }) => {
        console.error(`[chat] ${candidate.provider.name} stream error:`, error);
      },
    };
  };

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
      // Bind the per-request context so tools can emit approval requests into this
      // same stream (tools run during the fullStream loop below, after this point).
      reqCtx.emit = emit;

      // Tell the client to fold its own working history the same way, so the
      // *next* request is smaller too — otherwise it would re-send the full
      // history, re-cross the threshold, and re-summarize from scratch every turn.
      if (contextCompacted) {
        emit({
          type: "context_compacted",
          summarizedCount: contextCompacted.summarizedCount,
          summary: contextCompacted.summary,
        });
      }

      // Try each provider in the fallback chain. A candidate only "wins" once its
      // first real part arrives off fullStream — we can't swap providers after
      // content has already started reaching the client.
      let attempt;
      try {
        attempt = await streamWithFallback(chain, buildStreamOptions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: "error", value: msg });
        controller.close();
        return;
      }

      const winner = attempt.candidate.provider;
      // Assistant-row persistence and memory extraction below key off this,
      // not the originally-requested `provider` — cost/history should reflect
      // whoever actually answered.
      const capturedProvider: ProviderRecord = winner;
      emit({
        type: "provider_used",
        id: winner.id,
        name: winner.name,
        fellBack: winner.id !== provider.id,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see fallback.ts
      const handlePart = (part: TextStreamPart<any>) => {
        if (part.type === "text-delta") {
          emit({ type: "text", value: part.text });
        } else if (part.type === "reasoning-delta") {
          emit({ type: "reasoning", value: part.text });
        } else if (part.type === "tool-call") {
          // Surface each agent tool invocation so the client can render it as a
          // Claude-Code-style tool card (matched to its result by toolCallId).
          emit({ type: "tool_call", id: part.toolCallId, name: part.toolName, args: part.input });
        } else if (part.type === "tool-result") {
          emit({
            type: "tool_result",
            id: part.toolCallId,
            name: part.toolName,
            result: part.output,
          });
        } else if (part.type === "tool-error") {
          const msg = part.error instanceof Error ? part.error.message : String(part.error);
          emit({ type: "tool_result", id: part.toolCallId, name: part.toolName, error: msg });
        } else if (part.type === "error") {
          const msg = part.error instanceof Error ? part.error.message : String(part.error);
          emit({ type: "error", value: msg });
        }
      };

      try {
        // The cascade already consumed the first part to decide this candidate
        // won — handle it, then keep pulling from the same iterator so nothing
        // is skipped or re-read.
        handlePart(attempt.firstPart);
        while (true) {
          const next = await attempt.iterator.next();
          if (next.done) break;
          handlePart(next.value);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: "error", value: msg });
      } finally {
        const replyText = blocksToText(serverBlocks);

        // `totalUsage` is the documented Promise accessor on StreamTextResult — it
        // resolves once the full generation (all steps) completes, and rejects if
        // the stream errored, which it can have by this point. Not every openai-compat
        // endpoint reports usage on a streaming response, so a missing value stays
        // `null` (unknown) rather than becoming a misleading "0 tokens" / "$0.00".
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        try {
          const usage = await attempt.result.totalUsage;
          inputTokens = usage.inputTokens ?? null;
          outputTokens = usage.outputTokens ?? null;
        } catch {
          /* stream errored before usage was ever reported */
        }

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
                content: replyText,
                blocks: serializeBlocksForStorage(serverBlocks),
                providerId: capturedProvider.id,
                providerKind: capturedProvider.provider,
                modelName: attempt.candidate.modelOverride || capturedProvider.defaultModel || null,
                inputTokens,
                outputTokens,
                createdAt: new Date().toISOString(),
              })
              .run();
          } catch (err) {
            console.error("[chat] failed to persist assistant message:", err);
          }
        }
        // Extraction reads the same block-derived text just persisted above, rather
        // than a separate onFinish callback — onFinish is registered per streamText()
        // call, and this route now makes one such call per fallback candidate, which
        // would make "did onFinish fire for the winning attempt" an extra thing to
        // get right. Deriving from serverBlocks is unambiguous no matter which
        // candidate won.
        if (replyText.trim()) {
          const fullMessages: ModelMessage[] = [
            // Only real user/assistant turns feed extraction — never system messages
            // (host context, presets, memory blocks), which would otherwise get mined
            // and persisted as bogus "memories".
            ...messages.filter((m) => m.role !== "system"),
            { role: "assistant", content: replyText },
          ];
          void extractMemories(fullMessages).catch((err) =>
            console.error("[chat] extraction failed:", err)
          );
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

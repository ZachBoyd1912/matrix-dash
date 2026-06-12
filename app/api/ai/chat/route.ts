import { streamText, stepCountIs, type ModelMessage } from "ai";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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
import { providerSpec } from "@/types/ai-provider";

export const dynamic = "force-dynamic";

interface ChatPayload {
  messages: ModelMessage[];
  providerId?: string;
  modelOverride?: string;
  sessionId?: string;
  mode?: "chat" | "agent";
  presetId?: string;
}

function buildSkillsPrompt(): string {
  const enabled = getDb().select().from(skills).where(eq(skills.isEnabled, true)).all();
  if (enabled.length === 0) return "";
  const lines = enabled.map((s) => `### ${s.name}\n${s.instructions}`);
  return `You have the following skills — apply them when relevant:\n\n${lines.join("\n\n")}`;
}

export async function POST(req: Request) {
  let body: ChatPayload;
  try {
    body = (await req.json()) as ChatPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, providerId, modelOverride, sessionId, mode, presetId } = body;
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
  const skillsPrompt = isAgent ? buildSkillsPrompt() : "";

  const systemBits = [presetPrompt || appSettings.systemPrompt, agentPreamble, skillsPrompt, memoryContext]
    .map((b) => b?.trim())
    .filter((b): b is string => !!b);

  const finalMessages: ModelMessage[] = systemBits.length
    ? [{ role: "system", content: systemBits.join("\n\n") }, ...messages]
    : messages;

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

  // Extended thinking: only Anthropic supports it, and only when the user hasn't disabled it.
  const isAnthropic = providerSpec(provider.provider)?.sdk === "anthropic";
  const thinkingOn = isAnthropic && appSettings.enableThinking;
  const providerOptions = thinkingOn
    ? { anthropic: { thinking: { type: "enabled" as const, budgetTokens: 8000 } } }
    : undefined;

  const result = streamText({
    model,
    messages: finalMessages,
    tools,
    stopWhen: isAgent ? stepCountIs(8) : undefined,
    providerOptions,
    onFinish: async ({ text }) => {
      // Persist assistant reply.
      if (sessionId) {
        try {
          getDb()
            .insert(sessionMessages)
            .values({
              id: randomUUID(),
              sessionId,
              role: "assistant",
              content: text,
              providerId: capturedProvider.id,
              modelName: modelOverride || capturedProvider.defaultModel || null,
              createdAt: new Date().toISOString(),
            })
            .run();
        } catch (err) {
          console.error("[chat] failed to persist assistant message:", err);
        }
      }
      // Trigger extraction in the background.
      const fullMessages: ModelMessage[] = [
        ...messages,
        { role: "assistant", content: text },
      ];
      void extractMemories(fullMessages).catch((err) =>
        console.error("[chat] extraction failed:", err)
      );
    },
  });

  // NDJSON stream: one JSON object per line so the client can separate the main
  // reply ({type:"text"}) from the thinking trace ({type:"reasoning"}).
  const encoder = new TextEncoder();
  const line = (obj: Record<string, unknown>) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(line({ type: "text", value: part.text }));
          } else if (part.type === "reasoning-delta") {
            controller.enqueue(line({ type: "reasoning", value: part.text }));
          } else if (part.type === "error") {
            const msg = part.error instanceof Error ? part.error.message : String(part.error);
            controller.enqueue(line({ type: "error", value: msg }));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(line({ type: "error", value: msg }));
      } finally {
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

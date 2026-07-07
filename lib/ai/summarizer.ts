import { generateText, type ModelMessage } from "ai";
import { resolveModel, type ProviderRecord } from "./registry";
import { shouldFoldSystemPrompt } from "@/types/ai-provider";

/** Always kept verbatim, never folded into the summary — recent turns matter most. */
const KEEP_RECENT = 6;
const TARGET_SUMMARY_CHARS = 2000;

export interface SummarizeResult {
  summary: string;
  /** How many of the oldest messages this summary replaces. */
  summarizedCount: number;
}

function messageText(m: ModelMessage): string {
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
}

/**
 * Summarize the older portion of a conversation so it can be dropped from the
 * outgoing request, keeping the most recent KEEP_RECENT messages verbatim.
 *
 * This is a best-effort quality improvement over truncation, not a replacement
 * for it: it makes its own provider call (which can fail — a timeout, a
 * transient outage, an over-length transcript) and returns `null` on any
 * failure. Callers MUST have an independent truncation fallback that doesn't
 * depend on this succeeding.
 */
export async function summarizeOlderMessages(
  messages: ModelMessage[],
  provider: ProviderRecord,
  modelOverride?: string | null
): Promise<SummarizeResult | null> {
  if (messages.length <= KEEP_RECENT) return null;
  const older = messages.slice(0, messages.length - KEEP_RECENT);
  const transcript = older.map((m) => `${m.role}: ${messageText(m)}`).join("\n\n");

  const instruction = `Summarize this conversation history concisely (under ${TARGET_SUMMARY_CHARS} characters). Preserve names, decisions, and any facts a continuation would need. Write it as a neutral third-person summary, not a reply to the user.`;

  // Same "developer role" workaround as the chat route: some openai-compat
  // endpoints (deepseek, opencode, openrouter…) reject a "system" message
  // outright, so fold the instruction into the user turn for those instead.
  const promptMessages: ModelMessage[] = shouldFoldSystemPrompt(provider.provider)
    ? [{ role: "user", content: `${instruction}\n\n———\n\n${transcript}` }]
    : [
        { role: "system", content: instruction },
        { role: "user", content: transcript },
      ];

  try {
    const model = resolveModel(provider, modelOverride);
    const { text } = await generateText({
      model,
      messages: promptMessages,
      abortSignal: AbortSignal.timeout(20_000),
    });
    if (!text.trim()) return null;
    return { summary: text.trim(), summarizedCount: older.length };
  } catch (err) {
    console.error("[summarizer] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

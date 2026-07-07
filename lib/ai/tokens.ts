/**
 * Rough, provider-agnostic token estimate (~4 chars/token for English-ish
 * text). Deliberately not a real per-provider tokenizer: this app talks to
 * ~20 provider kinds, each with its own tokenizer (several, like Anthropic,
 * publish no offline one at all), and this estimate has to run identically on
 * the server (context-fit gate) and in the browser (the live context bar) — a
 * WASM/JS tokenizer bundle per SDK isn't practical for either side. Treat every
 * number this module produces as an estimate, not an exact count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface MessageLike {
  content: unknown;
}

export function estimateMessagesTokens(messages: MessageLike[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
  }
  return total;
}

interface ContextEntry {
  pattern: RegExp;
  limit: number;
}

/** Known context windows (tokens), most-specific-first — same matching approach as pricing.ts. */
const MODEL_CONTEXT_WINDOWS: ContextEntry[] = [
  { pattern: /claude-(opus-4|sonnet-4|3-7-sonnet)/i, limit: 200_000 },
  { pattern: /claude.*haiku/i, limit: 200_000 },
  { pattern: /gpt-4o|gpt-5/i, limit: 128_000 },
  { pattern: /^o[1-9]/i, limit: 128_000 },
  { pattern: /gemini-2\.5/i, limit: 1_000_000 },
  { pattern: /deepseek/i, limit: 64_000 },
  { pattern: /grok-3/i, limit: 128_000 },
  { pattern: /mistral-large/i, limit: 128_000 },
  { pattern: /llama-3\.3-70b/i, limit: 128_000 },
  { pattern: /command-r-plus/i, limit: 128_000 },
  { pattern: /sonar-pro/i, limit: 127_000 },
];

/** Rough per-provider-kind window when the specific model isn't listed above. */
const PROVIDER_FALLBACK_WINDOW: Record<string, number> = {
  anthropic: 200_000,
  openai: 128_000,
  google: 1_000_000,
  deepseek: 64_000,
  openrouter: 128_000,
  groq: 128_000,
  mistral: 32_000,
  xai: 128_000,
  togetherai: 32_000,
  fireworks: 32_000,
  cohere: 128_000,
  perplexity: 127_000,
  zhipu: 128_000,
  opencode: 32_000,
  hyperbolic: 32_000,
  novita: 32_000,
  azure: 128_000,
  custom: 32_000,
  ollama: 8_192,
  lmstudio: 8_192,
};

/** Conservative fallback for a provider kind/model this table has never heard of. */
const DEFAULT_CONTEXT_WINDOW = 32_000;

export function getModelContextLimit(providerKind: string | null, modelId: string | null): number {
  if (modelId) {
    const entry = MODEL_CONTEXT_WINDOWS.find((e) => e.pattern.test(modelId));
    if (entry) return entry.limit;
  }
  if (providerKind && PROVIDER_FALLBACK_WINDOW[providerKind] != null) {
    return PROVIDER_FALLBACK_WINDOW[providerKind];
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export function getContextUsagePercent(estimatedTokens: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((estimatedTokens / limit) * 100));
}

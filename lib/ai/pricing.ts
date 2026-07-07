interface PricingEntry {
  pattern: RegExp;
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Curated per-model rates (USD per 1M tokens), most-specific-first — the first
 * matching pattern wins. Providers change pricing often and these are
 * approximate; treat every figure this module produces as an estimate, not a
 * billing-accurate number. Model IDs vary in shape across providers/time
 * (`gpt-4o-2024-08-06`, `openai/gpt-4o` via OpenRouter, `claude-sonnet-4-5-20250929`),
 * so matching is by pattern against a normalized ID, not exact string equality.
 */
const MODEL_PRICING: PricingEntry[] = [
  // Anthropic
  { pattern: /claude-opus-4/i, inputPer1M: 15, outputPer1M: 75 },
  { pattern: /claude-(3-7-sonnet|sonnet-4)/i, inputPer1M: 3, outputPer1M: 15 },
  { pattern: /claude-3-5-haiku|claude.*haiku/i, inputPer1M: 0.8, outputPer1M: 4 },
  // OpenAI
  { pattern: /gpt-4o-mini/i, inputPer1M: 0.15, outputPer1M: 0.6 },
  { pattern: /gpt-4o/i, inputPer1M: 2.5, outputPer1M: 10 },
  { pattern: /gpt-5/i, inputPer1M: 5, outputPer1M: 15 },
  { pattern: /^o[1-9]/i, inputPer1M: 15, outputPer1M: 60 },
  // Google
  { pattern: /gemini-2\.5-pro/i, inputPer1M: 1.25, outputPer1M: 10 },
  { pattern: /gemini-2\.5-flash/i, inputPer1M: 0.3, outputPer1M: 2.5 },
  // DeepSeek
  { pattern: /deepseek-reasoner/i, inputPer1M: 0.55, outputPer1M: 2.19 },
  { pattern: /deepseek-chat/i, inputPer1M: 0.27, outputPer1M: 1.1 },
  // xAI
  { pattern: /grok-3/i, inputPer1M: 3, outputPer1M: 15 },
  // Mistral
  { pattern: /mistral-large/i, inputPer1M: 2, outputPer1M: 6 },
  // Groq-hosted Llama
  { pattern: /llama-3\.3-70b/i, inputPer1M: 0.59, outputPer1M: 0.79 },
  // Cohere
  { pattern: /command-r-plus/i, inputPer1M: 2.5, outputPer1M: 10 },
  // Perplexity
  { pattern: /sonar-pro/i, inputPer1M: 3, outputPer1M: 15 },
];

/** Rough per-provider-kind rate when a specific model isn't in MODEL_PRICING above. */
const PROVIDER_FALLBACK_RATES: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  anthropic: { inputPer1M: 3, outputPer1M: 15 },
  openai: { inputPer1M: 2.5, outputPer1M: 10 },
  google: { inputPer1M: 0.3, outputPer1M: 2.5 },
  deepseek: { inputPer1M: 0.27, outputPer1M: 1.1 },
  openrouter: { inputPer1M: 1, outputPer1M: 3 },
  groq: { inputPer1M: 0.59, outputPer1M: 0.79 },
  mistral: { inputPer1M: 2, outputPer1M: 6 },
  xai: { inputPer1M: 3, outputPer1M: 15 },
  togetherai: { inputPer1M: 0.9, outputPer1M: 0.9 },
  fireworks: { inputPer1M: 0.9, outputPer1M: 0.9 },
  cohere: { inputPer1M: 2.5, outputPer1M: 10 },
  perplexity: { inputPer1M: 1, outputPer1M: 1 },
  zhipu: { inputPer1M: 0.5, outputPer1M: 0.5 },
  opencode: { inputPer1M: 1, outputPer1M: 1 },
  hyperbolic: { inputPer1M: 0.4, outputPer1M: 0.4 },
  novita: { inputPer1M: 0.5, outputPer1M: 0.5 },
  azure: { inputPer1M: 2.5, outputPer1M: 10 },
  custom: { inputPer1M: 1, outputPer1M: 1 },
  // Local — no metered API cost.
  ollama: { inputPer1M: 0, outputPer1M: 0 },
  lmstudio: { inputPer1M: 0, outputPer1M: 0 },
};

function normalizeModelId(id: string): string {
  return id
    .replace(/^[\w.-]+\//, "") // OpenRouter-style vendor prefix: "openai/gpt-4o" → "gpt-4o"
    .replace(/-\d{4}-\d{2}-\d{2}$/, "") // trailing YYYY-MM-DD
    .replace(/-\d{8}$/, ""); // trailing YYYYMMDD
}

/**
 * Estimate USD cost for one message's token usage. Returns `null` (not `0`)
 * when there's nothing to price from — either no usage was recorded, or the
 * provider kind itself isn't in the fallback table — so callers can show
 * "unknown" instead of a misleading "$0.00" for cost that just wasn't tracked.
 */
export function estimateCost(
  providerKind: string | null,
  modelId: string | null,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const inTok = inputTokens ?? 0;
  const outTok = outputTokens ?? 0;

  if (modelId) {
    const normalized = normalizeModelId(modelId);
    const entry = MODEL_PRICING.find((e) => e.pattern.test(normalized) || e.pattern.test(modelId));
    if (entry) {
      return (inTok / 1_000_000) * entry.inputPer1M + (outTok / 1_000_000) * entry.outputPer1M;
    }
  }
  const fallback = providerKind ? PROVIDER_FALLBACK_RATES[providerKind] : undefined;
  if (fallback) {
    return (inTok / 1_000_000) * fallback.inputPer1M + (outTok / 1_000_000) * fallback.outputPer1M;
  }
  return null;
}

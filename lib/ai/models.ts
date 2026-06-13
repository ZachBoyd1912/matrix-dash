import type { JSONValue } from "ai";
import { providerSpec, type ProviderKind } from "@/types/ai-provider";

/** A model exposed by a provider's API, normalized across SDKs. */
export interface ModelInfo {
  id: string;
  label?: string;
  /** Whether this model supports a reasoning / "thinking" budget. */
  reasoning: boolean;
}

export interface ListModelsResult {
  models: ModelInfo[];
  error?: string;
}

export type ReasoningEffort = "off" | "low" | "medium" | "high";

interface ListModelsOpts {
  kind: ProviderKind | string;
  apiKey: string;
  baseUrl?: string | null;
  /** Skip the in-memory cache. */
  force?: boolean;
}

/**
 * Heuristic: does a model id belong to a family that supports a reasoning /
 * thinking budget? Used both to tag ModelInfo and to decide whether the chat UI
 * shows the thinking control. Intentionally a maintainable regex, not exhaustive.
 */
export function supportsReasoning(id: string): boolean {
  return /o[1-9]|gpt-5|reasoner|thinking|deepseek-r|grok.*(reason|4)|gemini-2\.5|claude.*(3-7|sonnet-4|opus-4)/i.test(
    id
  );
}

// ── Live model listing ──────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000;
const g = globalThis as unknown as {
  __matrixModelCache?: Map<string, { models: ModelInfo[]; at: number }>;
};
function cache() {
  if (!g.__matrixModelCache) g.__matrixModelCache = new Map();
  return g.__matrixModelCache;
}

function dedupeSort(ids: { id: string; label?: string }[]): ModelInfo[] {
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const m of ids) {
    if (!m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, label: m.label, reasoning: supportsReasoning(m.id) });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** The OpenAI-compatible `/models` base URL for a Bearer-auth provider. */
function bearerBase(kind: string, baseUrl?: string | null): string {
  const spec = providerSpec(kind);
  if (spec?.sdk === "mistral") return baseUrl || "https://api.mistral.ai/v1";
  if (spec?.sdk === "xai") return baseUrl || "https://api.x.ai/v1";
  return baseUrl || spec?.baseUrl || "https://api.openai.com/v1";
}

async function fetchModels(opts: ListModelsOpts, signal: AbortSignal): Promise<{ id: string; label?: string }[]> {
  const { kind, apiKey, baseUrl } = opts;
  const sdk = providerSpec(kind)?.sdk ?? "openai-compat";

  if (sdk === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal,
    });
    if (!r.ok) throw new Error(`Anthropic /models → ${r.status}`);
    const json = (await r.json()) as { data?: { id: string; display_name?: string }[] };
    return (json.data ?? []).map((m) => ({ id: m.id, label: m.display_name }));
  }

  if (sdk === "google") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
      { signal }
    );
    if (!r.ok) throw new Error(`Google /models → ${r.status}`);
    const json = (await r.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (json.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName }));
  }

  // mistral · xai · openai-compat — all Bearer + {base}/models → data[].id
  const base = bearerBase(kind, baseUrl).replace(/\/$/, "");
  const r = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!r.ok) throw new Error(`${base}/models → ${r.status}`);
  const json = (await r.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => ({ id: m.id }));
}

/**
 * List the models a provider's key grants. Takes a *decrypted* key directly so
 * both saved providers (route decrypts first) and the add-provider form (raw key
 * in body) share one path. Never logs or persists the key. Returns an empty list
 * plus an `error` string on failure so callers can fall back to free-text entry.
 */
export async function listModels(opts: ListModelsOpts): Promise<ListModelsResult> {
  const key = `${opts.kind}|${opts.baseUrl ?? ""}`;
  if (!opts.force) {
    const hit = cache().get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { models: hit.models };
  }
  try {
    const raw = await fetchModels(opts, AbortSignal.timeout(10_000));
    const models = dedupeSort(raw);
    cache().set(key, { models, at: Date.now() });
    return { models };
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Reasoning → provider options ─────────────────────────────────────────────

const ANTHROPIC_BUDGET: Record<Exclude<ReasoningEffort, "off">, number> = { low: 4000, medium: 8000, high: 16000 };
const GOOGLE_BUDGET: Record<Exclude<ReasoningEffort, "off">, number> = { low: 2048, medium: 8192, high: 24576 };

/**
 * Translate a per-request reasoning effort into AI SDK `providerOptions`, scoped
 * to the provider's SDK and the model's capability. When the request omits an
 * effort, fall back to the global `enableThinking` setting so existing behavior
 * is preserved. Returns undefined when no reasoning options apply.
 */
export function buildProviderOptions(
  kind: ProviderKind | string,
  modelId: string,
  effort: ReasoningEffort | undefined,
  settingsEnableThinking: boolean
): Record<string, Record<string, JSONValue>> | undefined {
  const sdk = providerSpec(kind)?.sdk ?? "openai-compat";

  // Resolve the effective effort: explicit request wins; otherwise the global
  // toggle maps to "medium" (today's blanket Anthropic budget of 8000).
  let level: Exclude<ReasoningEffort, "off"> | null = null;
  if (effort && effort !== "off") level = effort;
  else if (effort === undefined && settingsEnableThinking) level = "medium";

  if (!level || !supportsReasoning(modelId)) return undefined;

  switch (sdk) {
    case "anthropic":
      return { anthropic: { thinking: { type: "enabled", budgetTokens: ANTHROPIC_BUDGET[level] } } };
    case "google":
      return { google: { thinkingConfig: { thinkingBudget: GOOGLE_BUDGET[level] } } };
    case "xai":
      return { xai: { reasoningEffort: level } };
    case "openai-compat":
      // Only the first-party OpenAI endpoint reliably accepts reasoningEffort;
      // other openai-compat providers reason implicitly, so leave them alone.
      return kind === "openai" ? { openai: { reasoningEffort: level } } : undefined;
    default:
      return undefined;
  }
}

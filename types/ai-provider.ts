export type ProviderKind =
  | "anthropic"
  | "openai"
  | "google"
  | "custom"
  | "deepseek"
  | "openrouter"
  | "groq"
  | "mistral"
  | "togetherai"
  | "fireworks"
  | "xai"
  | "zhipu"
  | "opencode"
  | "ollama"
  | "lmstudio"
  | "cohere"
  | "perplexity"
  | "hyperbolic"
  | "novita"
  | "azure";

/** Which Vercel AI SDK adapter resolves a given provider kind. */
export type ProviderSdk = "anthropic" | "google" | "mistral" | "xai" | "openai-compat";

export interface ProviderSpec {
  value: ProviderKind;
  label: string;
  sdk: ProviderSdk;
  /** Pre-filled base URL; null means the SDK default (or user-supplied). */
  baseUrl: string | null;
  defaultModel: string;
  /** When true, the base URL must be supplied by the user. */
  requiresBaseUrl?: boolean;
  /** Runs on the user's machine (Ollama, LM Studio) — no API key needed. */
  local?: boolean;
}

/** Single source of truth for every selectable provider. */
export const PROVIDER_CATALOG: ProviderSpec[] = [
  {
    value: "anthropic",
    label: "Anthropic",
    sdk: "anthropic",
    baseUrl: null,
    defaultModel: "claude-sonnet-4-5",
  },
  { value: "openai", label: "OpenAI", sdk: "openai-compat", baseUrl: null, defaultModel: "gpt-4o" },
  {
    value: "google",
    label: "Google Gemini",
    sdk: "google",
    baseUrl: null,
    defaultModel: "gemini-2.5-flash",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    sdk: "openai-compat",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    sdk: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
  },
  {
    value: "groq",
    label: "Groq",
    sdk: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    value: "mistral",
    label: "Mistral",
    sdk: "mistral",
    baseUrl: null,
    defaultModel: "mistral-large-latest",
  },
  { value: "xai", label: "xAI Grok", sdk: "xai", baseUrl: null, defaultModel: "grok-3" },
  {
    value: "togetherai",
    label: "Together AI",
    sdk: "openai-compat",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3-70b-chat-hf",
  },
  {
    value: "fireworks",
    label: "Fireworks AI",
    sdk: "openai-compat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  },
  {
    value: "cohere",
    label: "Cohere",
    sdk: "openai-compat",
    baseUrl: "https://api.cohere.com/compatibility/v1",
    defaultModel: "command-r-plus",
  },
  {
    value: "perplexity",
    label: "Perplexity",
    sdk: "openai-compat",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
  },
  {
    value: "zhipu",
    label: "Z.AI (Zhipu)",
    sdk: "openai-compat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4",
  },
  {
    value: "hyperbolic",
    label: "Hyperbolic",
    sdk: "openai-compat",
    baseUrl: "https://api.hyperbolic.xyz/v1",
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
  },
  {
    value: "novita",
    label: "Novita AI",
    sdk: "openai-compat",
    baseUrl: "https://api.novita.ai/v3/openai",
    defaultModel: "meta-llama/llama-3.1-70b-instruct",
  },
  {
    value: "opencode",
    label: "OpenCode",
    sdk: "openai-compat",
    baseUrl: "https://api.opencode.ai/v1",
    defaultModel: "opencode-latest",
  },
  {
    value: "ollama",
    label: "Ollama (Local)",
    sdk: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2:3b",
    local: true,
  },
  {
    value: "lmstudio",
    label: "LM Studio (Local)",
    sdk: "openai-compat",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    requiresBaseUrl: true,
    local: true,
  },
  {
    value: "azure",
    label: "Azure OpenAI",
    sdk: "openai-compat",
    baseUrl: null,
    defaultModel: "gpt-4o",
    requiresBaseUrl: true,
  },
  {
    value: "custom",
    label: "Custom (OpenAI-compatible)",
    sdk: "openai-compat",
    baseUrl: null,
    defaultModel: "",
    requiresBaseUrl: true,
  },
];

/** Provider shape safe to send to the client — never includes the API key. */
export interface AiProviderPublic {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string | null;
  defaultModel: string | null;
  isActive: boolean | null;
  createdAt: string;
}

export const PROVIDER_KINDS: { value: ProviderKind; label: string }[] = PROVIDER_CATALOG.map(
  (p) => ({ value: p.value, label: p.label })
);

export const DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
  PROVIDER_CATALOG.map((p) => [p.value, p.defaultModel])
);

export const PROVIDER_BASE_URLS: Record<string, string | null> = Object.fromEntries(
  PROVIDER_CATALOG.map((p) => [p.value, p.baseUrl])
);

export function providerSpec(kind: string): ProviderSpec | undefined {
  return PROVIDER_CATALOG.find((p) => p.value === kind);
}

/** Whether a kind needs a user-supplied base URL field in the form. */
export function showsBaseUrl(kind: string): boolean {
  const spec = providerSpec(kind);
  return !!spec && (spec.baseUrl !== null || !!spec.requiresBaseUrl);
}

/** Whether a kind needs an API key. Local providers (Ollama, LM Studio) don't. */
export function requiresApiKey(kind: string): boolean {
  return !providerSpec(kind)?.local;
}

/** Placeholder key stored for local providers, which authenticate no requests. */
export const LOCAL_API_KEY = "local";

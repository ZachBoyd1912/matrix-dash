export type ProviderKind = "openai" | "anthropic" | "google" | "custom";

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

export const PROVIDER_KINDS: { value: ProviderKind; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  google: "gemini-2.5-flash",
  custom: "",
};

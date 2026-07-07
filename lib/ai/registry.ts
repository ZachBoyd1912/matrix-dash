import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";
import { eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";
import { getAppSettings } from "@/lib/db/settings";
import {
  DEFAULT_MODELS,
  providerSpec,
  type AiProviderPublic,
  type ProviderKind,
} from "@/types/ai-provider";

export type ProviderRecord = typeof aiProviders.$inferSelect;

export function toPublic(p: ProviderRecord): AiProviderPublic {
  return {
    id: p.id,
    name: p.name,
    provider: p.provider as ProviderKind,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    isActive: p.isActive,
    createdAt: p.createdAt,
  };
}

export function listProviders(): AiProviderPublic[] {
  return getDb().select().from(aiProviders).all().map(toPublic);
}

export function getProvider(id: string): ProviderRecord | undefined {
  return getDb().select().from(aiProviders).where(eq(aiProviders.id, id)).get();
}

export function getActiveProvider(): ProviderRecord | undefined {
  return getDb().select().from(aiProviders).where(eq(aiProviders.isActive, true)).get();
}

export function resolveModel(provider: ProviderRecord, override?: string | null): LanguageModel {
  const apiKey = decrypt(provider.apiKeyEncrypted);
  const modelId = override || provider.defaultModel || DEFAULT_MODELS[provider.provider] || "";
  const spec = providerSpec(provider.provider);
  const sdk = spec?.sdk ?? "openai-compat";

  switch (sdk) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "mistral":
      return createMistral({ apiKey, baseURL: provider.baseUrl || undefined })(modelId);
    case "xai":
      return createXai({ apiKey, baseURL: provider.baseUrl || undefined })(modelId);
    case "openai-compat":
    default: {
      // provider.baseUrl (user override) wins; otherwise the catalog's pre-filled URL;
      // otherwise undefined → native OpenAI endpoint. `.chat()` maximizes third-party compat.
      const baseURL = provider.baseUrl || spec?.baseUrl || undefined;
      return createOpenAI({ apiKey, baseURL }).chat(modelId);
    }
  }
}

export interface FallbackCandidate {
  provider: ProviderRecord;
  /** Only set for the originally-requested provider — fallbacks use their own default model. */
  modelOverride?: string | null;
}

/**
 * Builds the ranked list of providers to try for one chat turn: the requested
 * (or active) provider first, then the user's configured fallback order from
 * Settings → AI Providers, skipping duplicates and any provider that's since
 * been deleted.
 */
export function getFallbackChain(
  primary: ProviderRecord,
  modelOverride?: string | null
): FallbackCandidate[] {
  const { fallbackProviderIds } = getAppSettings();
  const chain: FallbackCandidate[] = [{ provider: primary, modelOverride }];
  const seen = new Set([primary.id]);

  for (const id of fallbackProviderIds) {
    if (seen.has(id)) continue;
    const p = getProvider(id);
    if (!p) continue;
    seen.add(id);
    chain.push({ provider: p });
  }
  return chain;
}

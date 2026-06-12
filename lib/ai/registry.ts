import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";
import { DEFAULT_MODELS, type AiProviderPublic } from "@/types/ai-provider";

export type ProviderRecord = typeof aiProviders.$inferSelect;

export function toPublic(p: ProviderRecord): AiProviderPublic {
  return {
    id: p.id,
    name: p.name,
    provider: p.provider,
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
  const modelId = override || provider.defaultModel || DEFAULT_MODELS[provider.provider];

  switch (provider.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "custom":
      return createOpenAI({ apiKey, baseURL: provider.baseUrl ?? undefined })(modelId);
    default: {
      const exhaustive: never = provider.provider;
      throw new Error(`Unknown provider: ${exhaustive as string}`);
    }
  }
}

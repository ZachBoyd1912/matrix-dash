import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/utils/crypto";
import { getSetting } from "@/lib/db/settings";

/**
 * Embeddings are optional and provider-dependent. We use an OpenAI-compatible
 * embedding endpoint when one is configured (a saved OpenAI or custom provider).
 * If none exists, embedding is a no-op and retrieval falls back to FTS5.
 */
function getEmbeddingModel() {
  // Prefer an explicit embedding provider id from settings, else first OpenAI/custom.
  const explicit = getSetting("embeddingProviderId");
  const db = getDb();
  let provider = explicit
    ? db.select().from(aiProviders).where(eq(aiProviders.id, explicit)).get()
    : undefined;
  if (!provider) {
    provider = db.select().from(aiProviders).where(eq(aiProviders.provider, "openai")).get();
  }
  if (!provider) {
    provider = db.select().from(aiProviders).where(eq(aiProviders.provider, "custom")).get();
  }
  if (!provider) return null;

  const apiKey = decrypt(provider.apiKeyEncrypted);
  const model = getSetting("embeddingModel") || "text-embedding-3-small";
  const sdk = createOpenAI({ apiKey, baseURL: provider.baseUrl ?? undefined });
  return sdk.textEmbeddingModel(model);
}

export function embeddingsAvailable(): boolean {
  return getEmbeddingModel() !== null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const model = getEmbeddingModel();
  if (!model) return null;
  try {
    const { embedding } = await embed({ model, value: text.slice(0, 4000) });
    return embedding;
  } catch {
    return null;
  }
}

export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const model = getEmbeddingModel();
  if (!model) return texts.map(() => null);
  try {
    const { embeddings } = await embedMany({ model, values: texts.map((t) => t.slice(0, 4000)) });
    return embeddings;
  } catch {
    return texts.map(() => null);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as number[]) : null;
  } catch {
    return null;
  }
}

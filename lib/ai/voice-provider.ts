import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

/**
 * Resolve an OpenAI-compatible key/baseUrl for voice (Whisper STT / TTS) from the
 * existing ai_providers table. STT prefers Groq (fast, free-tier Whisper) then
 * OpenAI; TTS uses OpenAI. Returns null when no suitable provider is configured,
 * so callers can fall back to the browser engine.
 */
export interface VoiceEndpoint {
  apiKey: string;
  baseUrl: string;
  kind: string;
}

const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
};

function resolve(preferKinds: string[]): VoiceEndpoint | null {
  const rows = getDb().select().from(aiProviders).all();
  for (const kind of preferKinds) {
    const match = rows.find((r) => r.provider.toLowerCase() === kind);
    if (!match) continue;
    let apiKey: string;
    try {
      apiKey = decrypt(match.apiKeyEncrypted);
    } catch {
      continue;
    }
    if (!apiKey) continue;
    return {
      apiKey,
      baseUrl: (match.baseUrl && match.baseUrl.trim()) || DEFAULT_BASE[kind] || DEFAULT_BASE.openai,
      kind,
    };
  }
  return null;
}

/** Whisper STT endpoint (Groq preferred, then OpenAI). */
export function resolveSttEndpoint(): VoiceEndpoint | null {
  return resolve(["groq", "openai"]);
}

/** TTS endpoint (OpenAI). */
export function resolveTtsEndpoint(): VoiceEndpoint | null {
  return resolve(["openai"]);
}

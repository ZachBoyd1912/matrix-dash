import { getSetting } from "@/lib/db/settings";
import type { OllamaModel } from "./ollama-shared";

export type { OllamaModel } from "./ollama-shared";

function getOllamaUrl(): string {
  return (getSetting("ollamaUrl") || "http://localhost:11434").replace(/\/$/, "");
}

export async function detectOllama(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { version?: string };
    return { ok: true, version: data.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listOllamaModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OllamaModel[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

/** Stream pull progress as a ReadableStream the route can pipe to the client. */
export async function pullOllamaModel(name: string): Promise<Response> {
  return fetch(`${getOllamaUrl()}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
  });
}

export async function deleteOllamaModel(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/delete`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}


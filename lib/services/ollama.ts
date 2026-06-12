import { spawn, exec } from "child_process";
import { promisify } from "util";
import { getSetting, setSetting } from "@/lib/db/settings";
import type { OllamaModel } from "./ollama-shared";

export type { OllamaModel } from "./ollama-shared";

const pexec = promisify(exec);

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

/* ------------------------------------------------------------------ *
 * Serve controls + runtime config (Cookbook tabs 2 & 4)
 * ------------------------------------------------------------------ */

export interface LoadedModel {
  name: string;
  size: number;
  sizeVram?: number;
  expiresAt?: string;
}

/** Models currently resident in memory (Ollama `/api/ps`). */
export async function psOllama(): Promise<LoadedModel[]> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/ps`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: { name: string; size: number; size_vram?: number; expires_at?: string }[];
    };
    return (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      sizeVram: m.size_vram,
      expiresAt: m.expires_at,
    }));
  } catch {
    return [];
  }
}

export interface OllamaConfig {
  numCtx: number;
  numGpu: number;
  keepAlive: string;
  numThread: number;
}

const CONFIG_KEYS: Record<keyof OllamaConfig, string> = {
  numCtx: "ollamaNumCtx",
  numGpu: "ollamaNumGpu",
  keepAlive: "ollamaKeepAlive",
  numThread: "ollamaNumThread",
};

const CONFIG_DEFAULTS: OllamaConfig = {
  numCtx: 4096,
  numGpu: 999,
  keepAlive: "5m",
  numThread: 0,
};

export function getOllamaConfig(): OllamaConfig {
  return {
    numCtx: parseInt(getSetting(CONFIG_KEYS.numCtx) || "", 10) || CONFIG_DEFAULTS.numCtx,
    numGpu: parseInt(getSetting(CONFIG_KEYS.numGpu) || "", 10) || CONFIG_DEFAULTS.numGpu,
    keepAlive: getSetting(CONFIG_KEYS.keepAlive) || CONFIG_DEFAULTS.keepAlive,
    numThread: parseInt(getSetting(CONFIG_KEYS.numThread) || "", 10) || CONFIG_DEFAULTS.numThread,
  };
}

export function setOllamaConfig(patch: Partial<OllamaConfig>): OllamaConfig {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    setSetting(CONFIG_KEYS[k as keyof OllamaConfig], String(v));
  }
  return getOllamaConfig();
}

export interface ServeStatus {
  running: boolean;
  pid?: number;
  memMb?: number;
  cpu?: number;
  startedAt?: string;
  version?: string;
}

/** Best-effort process probe for a running `ollama` daemon (macOS/Linux). */
export async function ollamaServeStatus(): Promise<ServeStatus> {
  const ver = await detectOllama();
  let proc: { pid?: number; memMb?: number; cpu?: number; startedAt?: string } = {};
  try {
    // ps columns: pid, %cpu, rss(KB), lstart
    const { stdout } = await pexec(
      "ps -axo pid=,pcpu=,rss=,lstart=,comm= | grep -i '[o]llama' | head -1",
      { timeout: 4000 }
    );
    const line = stdout.trim();
    if (line) {
      const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s+\S*ollama\S*$/);
      if (m) {
        proc = {
          pid: parseInt(m[1], 10),
          cpu: parseFloat(m[2]),
          memMb: Math.round(parseInt(m[3], 10) / 1024),
          startedAt: m[4].trim(),
        };
      } else {
        const pid = parseInt(line.split(/\s+/)[0], 10);
        if (!Number.isNaN(pid)) proc.pid = pid;
      }
    }
  } catch {
    /* ps unavailable — fall back to reachability only */
  }
  return { running: ver.ok, version: ver.version, ...proc };
}

/** Spawn a detached `ollama serve`, injecting saved env-configurable settings. */
export async function startOllama(): Promise<{ ok: boolean; error?: string }> {
  const already = await detectOllama();
  if (already.ok) return { ok: true };
  const cfg = getOllamaConfig();
  try {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        OLLAMA_KEEP_ALIVE: cfg.keepAlive,
        OLLAMA_CONTEXT_LENGTH: String(cfg.numCtx),
      },
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopOllama(): Promise<{ ok: boolean; error?: string }> {
  try {
    // Kill the `ollama serve` process; leave the desktop app's other procs alone.
    await pexec("pkill -f 'ollama serve'", { timeout: 4000 }).catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function restartOllama(): Promise<{ ok: boolean; error?: string }> {
  await stopOllama();
  await new Promise((r) => setTimeout(r, 800));
  return startOllama();
}

